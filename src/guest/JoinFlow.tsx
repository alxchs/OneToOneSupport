import React, { useEffect, useState } from 'react';
import { GuestWsClient } from './ws/client';
import { GuestRoom } from './GuestRoom';
import { extractHostPublicKeyFromFragment } from '../shared/crypto/invite';

export type JoinStep =
  | 'reading_url'
  | 'connecting'
  | 'authenticating'
  | 'handshaking'
  | 'in_room'
  | 'invalid_token'
  | 'session_ended'
  | 'error';

export const JoinFlow: React.FC = () => {
  const [step, setStep] = useState<JoinStep>('reading_url');
  const [mensagemErro, setMensagemErro] = useState<string>('');
  const [wsClient, setWsClient] = useState<GuestWsClient | null>(null);
  const [sessaoId, setSessaoId] = useState<string>('sessao-ativa');

  useEffect(() => {
    let clientInstance: GuestWsClient | null = null;

    const iniciarEntrada = async () => {
      try {
        // 1. Extração do Token de Acesso da URL (Path ou Query)
        const pathname = window.location.pathname;
        let token = '';

        if (pathname.includes('/join/')) {
          const parts = pathname.split('/join/');
          token = parts[1]?.split('/')[0]?.trim() || '';
        }

        if (!token) {
          const urlParams = new URLSearchParams(window.location.search);
          token = urlParams.get('token')?.trim() || '';
        }

        // 2. Extração da Chave Pública do Host do Fragmento (#pk_h)
        const fragment = window.location.hash;
        if (!token || !fragment) {
          setStep('invalid_token');
          setMensagemErro('Link de convite incompleto ou ausente. Solicite um novo link ou QR Code.');
          return;
        }

        let hostPublicKey: Uint8Array;
        try {
          hostPublicKey = extractHostPublicKeyFromFragment(fragment);
        } catch {
          setStep('invalid_token');
          setMensagemErro('Chave de segurança do convite é inválida. Solicite um novo link.');
          return;
        }

        // 3. Monta a URL de WebSocket compatível com HTTP/HTTPS da LAN
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${wsProtocol}//${window.location.host}`;

        setStep('connecting');

        clientInstance = new GuestWsClient({
          wsUrl,
          token,
          hostPublicKey,
          onStateChange: (state) => {
            if (state === 'authenticating') setStep('authenticating');
            if (state === 'handshaking') setStep('handshaking');
            if (state === 'closed') setStep('session_ended');
          },
          onMessage: (msg) => {
            if (msg.type === 'SESSION_READY') {
              if (msg.sessaoId) setSessaoId(msg.sessaoId);
            }
          },
          onError: (err) => {
            console.warn('[JoinFlow] Erro reportado pelo cliente:', err.message);
          },
        });

        // 4. Executa Conexão, Autenticação e Handshake X25519
        await clientInstance.connect();

        // 5. REGRA CRÍTICA DE SEGURANÇA (Mestre §6 e Ordem de Serviço):
        // Remove o fragmento #<pk_h> do histórico do navegador após o handshake bem-sucedido
        window.history.replaceState(null, '', window.location.pathname);

        setWsClient(clientInstance);
        setStep('in_room');
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('AUTH_FAILED') || msg.includes('inválido') || msg.includes('expirado') || msg.includes('utilizado')) {
          setStep('invalid_token');
          setMensagemErro('Este convite já foi utilizado ou expirou. Solicite um novo acesso.');
        } else {
          setStep('error');
          setMensagemErro('Não foi possível conectar à sessão. Verifique se o anfitrião está com a sala aberta.');
        }
      }
    };

    iniciarEntrada();

    return () => {
      // Ao desmontar o fluxo Join, se não estiver na sala, fecha o cliente
      if (clientInstance && step !== 'in_room') {
        clientInstance.close();
      }
    };
  }, []);

  // Se o handshake concluiu com sucesso, exibe a sala de atendimento
  if (step === 'in_room' && wsClient) {
    return (
      <GuestRoom
        wsClient={wsClient}
        sessaoId={sessaoId}
        onSessionEnded={() => setStep('session_ended')}
      />
    );
  }

  // Telas de Carregamento, Autenticação e Estados Limpos
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        height: '100dvh',
        minHeight: '100dvh',
        backgroundColor: '#0b1120',
        color: '#f8fafc',
        padding: '1.5rem',
        boxSizing: 'border-box',
      }}
    >
      <div
        id="join-flow-card"
        style={{
          backgroundColor: '#0f172a',
          border: '1px solid #1e293b',
          borderRadius: '1rem',
          padding: '2rem 1.5rem',
          maxWidth: '24rem',
          width: '100%',
          textAlign: 'center',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '1rem',
        }}
      >
        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: '50%',
            backgroundColor: '#111e38',
            border: '1px solid #0284c7',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#38bdf8',
          }}
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
          </svg>
        </div>

        <h1 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, color: '#f8fafc' }}>
          OneToOneSupport
        </h1>

        {/* Estados de Progresso */}
        {(step === 'reading_url' || step === 'connecting') && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'center' }}>
            <span style={{ fontSize: '0.9375rem', color: '#38bdf8', fontWeight: 500 }}>
              Conectando à sessão segura...
            </span>
            <span style={{ fontSize: '0.8125rem', color: '#64748b' }}>
              Localizando servidor do profissional na rede local
            </span>
          </div>
        )}

        {step === 'authenticating' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'center' }}>
            <span style={{ fontSize: '0.9375rem', color: '#38bdf8', fontWeight: 500 }}>
              Validando credenciais...
            </span>
            <span style={{ fontSize: '0.8125rem', color: '#64748b' }}>
              Verificando convite de uso único (One-Shot Token)
            </span>
          </div>
        )}

        {step === 'handshaking' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'center' }}>
            <span style={{ fontSize: '0.9375rem', color: '#34d399', fontWeight: 500 }}>
              Criptografando canal (E2EE)...
            </span>
            <span style={{ fontSize: '0.8125rem', color: '#64748b' }}>
              Troca de chaves X25519 e ChaCha20-Poly1305
            </span>
          </div>
        )}

        {/* Estado: Convite Inválido / Expirado */}
        {step === 'invalid_token' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', alignItems: 'center' }}>
            <span style={{ fontSize: '1rem', fontWeight: 600, color: '#fbbf24' }}>
              Convite Inválido ou Expirado
            </span>
            <p style={{ margin: 0, fontSize: '0.875rem', color: '#94a3b8', lineHeight: 1.5 }}>
              {mensagemErro || 'Este link de atendimento não é mais válido ou o prazo para acesso expirou.'}
            </p>
            <p style={{ margin: 0, fontSize: '0.8125rem', color: '#64748b' }}>
              Solicite um novo link ou QR Code ao profissional.
            </p>
          </div>
        )}

        {/* Estado: Sessão Encerrada */}
        {step === 'session_ended' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', alignItems: 'center' }}>
            <span style={{ fontSize: '1rem', fontWeight: 600, color: '#f8fafc' }}>
              Sessão Encerrada
            </span>
            <p style={{ margin: 0, fontSize: '0.875rem', color: '#94a3b8', lineHeight: 1.5 }}>
              O atendimento foi finalizado pelo profissional.
            </p>
            <span style={{ fontSize: '0.8125rem', color: '#64748b' }}>
              Você já pode fechar esta página com segurança.
            </span>
          </div>
        )}

        {/* Estado: Erro de Transporte */}
        {step === 'error' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', alignItems: 'center' }}>
            <span style={{ fontSize: '1rem', fontWeight: 600, color: '#fbbf24' }}>
              Falha na Conexão
            </span>
            <p style={{ margin: 0, fontSize: '0.875rem', color: '#94a3b8', lineHeight: 1.5 }}>
              {mensagemErro || 'Não foi possível conectar ao servidor.'}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="touch-btn touch-btn-primary"
              style={{ marginTop: '0.5rem', width: '100%' }}
            >
              Tentar Novamente
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
