#!/usr/bin/env node
/**
 * tools/test-guest-client.cjs
 * Cliente de teste autônomo (Guest) para validação E2EE em tempo real contra o Host.
 * Uso: node tools/test-guest-client.cjs <inviteUrl>
 */
const { WebSocket } = require('ws');
const sodium = require('libsodium-wrappers-sumo');
const crypto = require('crypto');
const { performance } = require('perf_hooks');

function decodeBase64Url(str) {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4 !== 0) base64 += '=';
  return new Uint8Array(Buffer.from(base64, 'base64'));
}

function encodeBase64Url(bytes) {
  return Buffer.from(bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function buildNonce(direction, counter) {
  const nonce = new Uint8Array(12);
  const dirBuf = Buffer.from(direction + '\0', 'utf8');
  nonce.set(dirBuf.subarray(0, 4), 0);
  const view = new DataView(nonce.buffer, nonce.byteOffset, 12);
  view.setBigUint64(4, BigInt(counter), false);
  return nonce;
}

function validateNonce(nonce, expectedDirection, lastSeenCounter) {
  const dirStr = Buffer.from(nonce.subarray(0, 3)).toString('utf8');
  if (dirStr !== expectedDirection || nonce[3] !== 0) {
    throw new Error(`Direção do nonce inválida: esperado ${expectedDirection}`);
  }
  const view = new DataView(nonce.buffer, nonce.byteOffset, 12);
  const counter = view.getBigUint64(4, false);
  if (counter <= BigInt(lastSeenCounter)) {
    throw new Error(`Nonce regressivo ou repetido (replay attack): ${counter} <= ${lastSeenCounter}`);
  }
  return counter;
}

async function runTestGuestClient(inviteUrl) {
  await sodium.ready;

  const url = new URL(inviteUrl);
  const parts = url.pathname.split('/').filter(Boolean);
  const joinIdx = parts.indexOf('join');
  if (joinIdx === -1 || joinIdx === parts.length - 1) {
    throw new Error('URL de convite inválida: caminho deve conter /join/<token>');
  }
  const token = decodeURIComponent(parts[joinIdx + 1]);
  const hash = url.hash.replace(/^#/, '');
  if (!hash) {
    throw new Error('URL de convite não possui fragmento de chave pública (#pk_h)');
  }
  const hostPk = decodeBase64Url(hash);
  if (hostPk.length !== 32) {
    throw new Error(`Chave pública do Host possui tamanho inválido (${hostPk.length} bytes; esperado 32)`);
  }

  const wsProto = url.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${wsProto}//${url.host}/ws`;

  console.log(`[TestGuestClient] Conectando a ${wsUrl}...`);
  console.log(`[TestGuestClient] Token: ${token.slice(0, 8)}... (tamanho: ${token.length})`);
  console.log(`[TestGuestClient] Chave Pública do Host (#pk_h): ${hash.slice(0, 10)}... (32 bytes)`);

  const ws = new WebSocket(wsUrl);

  await new Promise((resolve, reject) => {
    ws.on('open', resolve);
    ws.on('error', reject);
  });

  console.log('[TestGuestClient] Conexão WebSocket estabelecida com sucesso.');

  // Gerar par de chaves efêmero X25519 do Guest
  const guestKeys = sodium.crypto_kx_keypair();
  const guestPk = new Uint8Array(guestKeys.publicKey);
  const guestSk = new Uint8Array(guestKeys.privateKey);

  // Derivar chaves de sessão com crypto_kx_client_session_keys
  const derived = sodium.crypto_kx_client_session_keys(guestPk, guestSk, hostPk);
  const rxKey = new Uint8Array(derived.sharedRx);
  const txKey = new Uint8Array(derived.sharedTx);

  let txCounter = 0n;
  let lastRxCounter = 0n;

  function encrypt(plaintext) {
    txCounter += 1n;
    const nonce = buildNonce('G2H', txCounter);
    const plainBuf = typeof plaintext === 'string' ? Buffer.from(plaintext, 'utf8') : Buffer.from(plaintext);
    const ciphertext = sodium.crypto_aead_chacha20poly1305_ietf_encrypt(
      plainBuf,
      null,
      null,
      nonce,
      txKey
    );
    return {
      nonce: Buffer.from(nonce).toString('base64'),
      ciphertext: Buffer.from(ciphertext).toString('base64'),
    };
  }

  function decrypt(encPayload) {
    const nonce = Buffer.from(encPayload.nonce, 'base64');
    const ciphertext = Buffer.from(encPayload.ciphertext, 'base64');
    const counter = validateNonce(nonce, 'H2G', lastRxCounter);
    lastRxCounter = counter;

    const plaintext = sodium.crypto_aead_chacha20poly1305_ietf_decrypt(
      null,
      ciphertext,
      null,
      nonce,
      rxKey
    );
    return JSON.parse(Buffer.from(plaintext).toString('utf8'));
  }

  function waitForMessage() {
    return new Promise((resolve) => {
      ws.once('message', (data) => {
        resolve(JSON.parse(data.toString()));
      });
    });
  }

  // 1. Enviar AUTH em texto claro
  console.log('[TestGuestClient] Enviando AUTH (texto claro)...');
  ws.send(JSON.stringify({
    v: 1,
    id: crypto.randomUUID(),
    ts: Date.now(),
    type: 'AUTH',
    payload: { token },
  }));

  // 2. Enviar HANDSHAKE_INIT em texto claro com a chave pública do Guest
  console.log('[TestGuestClient] Enviando HANDSHAKE_INIT (pk_g claro)...');
  ws.send(JSON.stringify({
    v: 1,
    id: crypto.randomUUID(),
    ts: Date.now(),
    type: 'HANDSHAKE_INIT',
    payload: { clientPublicKey: encodeBase64Url(guestPk) },
  }));

  // 3. Aguardar SESSION_READY cifrado vindo do Host
  const readyEnvelope = await waitForMessage();
  if (readyEnvelope.type !== 'ENCRYPTED') {
    throw new Error(`Esperado ENCRYPTED pós-handshake, recebido: ${readyEnvelope.type}`);
  }

  const sessionReady = decrypt(readyEnvelope.payload);
  console.log('[TestGuestClient] Handshake E2EE concluído com sucesso!');
  console.log(`[TestGuestClient] SESSION_READY recebido. Reconnect Token rotacionado: ${sessionReady.reconnectToken.slice(0, 12)}...`);

  // 4. Medição de latência de eco cifrado (10 amostras)
  console.log('[TestGuestClient] Iniciando medição de latência de eco cifrado (10 pings)...');
  const latencies = [];

  for (let i = 0; i < 10; i++) {
    const echoId = `ping-${i + 1}-${Date.now()}`;
    const start = performance.now();

    const enc = encrypt(JSON.stringify({
      type: 'ECHO_PING',
      echoId,
      clientTs: Date.now(),
    }));

    ws.send(JSON.stringify({
      v: 1,
      id: crypto.randomUUID(),
      ts: Date.now(),
      type: 'ENCRYPTED',
      payload: enc,
    }));

    const responseEnv = await waitForMessage();
    const reply = decrypt(responseEnv.payload);
    const end = performance.now();

    if (reply.type !== 'ECHO_PONG' || reply.echoId !== echoId) {
      throw new Error(`Resposta de eco inesperada: ${JSON.stringify(reply)}`);
    }

    const rtt = end - start;
    latencies.push(rtt);
    console.log(`   [Eco #${(i + 1).toString().padStart(2, ' ')}] RTT: ${rtt.toFixed(2)} ms`);
  }

  const min = Math.min(...latencies);
  const max = Math.max(...latencies);
  const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;

  console.log('--- RESULTADOS DE LATÊNCIA (E2EE) ---');
  console.log(`Mínimo: ${min.toFixed(2)} ms`);
  console.log(`Máximo: ${max.toFixed(2)} ms`);
  console.log(`Média:  ${avg.toFixed(2)} ms`);
  console.log(`Critério de Aceite (§18 < 200 ms): ${avg < 200 ? 'PASS (Aprovado)' : 'FAIL'}`);

  // Encerra cliente de teste
  ws.close();

  return { min, max, avg, reconnectToken: sessionReady.reconnectToken };
}

if (require.main === module) {
  const inviteUrl = process.argv[2];
  if (!inviteUrl) {
    console.error('Uso: node tools/test-guest-client.cjs <inviteUrl>');
    process.exit(1);
  }

  runTestGuestClient(inviteUrl)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[TestGuestClient] Erro:', err.message);
      process.exit(1);
    });
}

module.exports = { runTestGuestClient };
