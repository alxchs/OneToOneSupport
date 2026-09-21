# Diagnóstico Técnico de Sincronização e Traço (H1 e H2)

**Data:** 2026-09-21  
**Ambiente de Homologação Real:** Host Windows 11 (Notebook LAN `192.168.1.200`), Guest Motorola Edge 70 Pro (Android 16, Chrome, Wi-Fi LAN).  
**Branch:** `fase/07-homologacao-1`

---

## 1. Sintomas Relatados

1. **H1:** A conexão E2EE via WebSocket e QR Code abre normalmente (Host exibe "Convidado Conectado (E2EE Ativo)"), mas o que é desenhado no Host não aparece no Guest, e o que é desenhado no Guest não aparece no Host.
2. **H2:** No celular do convidado, ao tentar desenhar com o dedo na tela, o traço surge momentaneamente e logo em seguida desaparece sem ser transmitido ao Host.

---

## 2. Hipóteses Investigadas

- **Hipótese A (H2 - Contexto Inseguro e crypto.randomUUID):** No Chrome/Android via rede local (`http://192.168.x.x:port`), a página roda em contexto HTTP não seguro (`isSecureContext === false`). Em contextos não seguros, a API padrão `crypto.randomUUID()` é `undefined` por especificação do W3C. Ao desenhar, a chamada a `crypto.randomUUID()` dentro do listener `path:created` lança exceção síncrona não tratada, abortando o fluxo antes do envio via WebSocket e antes de persistir no reducer local.
- **Hipótese B (H1 - Dessincronia de IDs no SQLite e Reducer):** O servidor Electron (`electron/server/index.ts`) em `handleGuestEvent` descarta o `id` e o `tipo` do elemento vetorial ao persistir no SQLite (`const payloadData = envelope.payload?.data ?? envelope.payload`), gerando IDs divergentes entre o Guest e o Host/banco.
- **Hipótese C (H1 - Supressão Silenciosa de Erros de Broadcast):** No IPC do Host (`electron/ipc/evento.ipc.ts`), o método `broadcastToGuest` é executado com retorno booleano ignorado e envolvido em `try {} catch {}` vazio, silenciando falhas de entrega de eventos para o Guest.
- **Hipótese D (H1 - Falta de Suporte a UNDO/REDO Bidirecional):** Tanto `HostApp.tsx`, quanto `GuestRoom.tsx`, quanto `electron/server/index.ts` filtram apenas `DRAW_ADD`, `DRAW_HIDE` e `CLEAR_TAB`, descartando solenemente `UNDO` e `REDO` vindos da outra ponta.
- **Hipótese E (H1 - Ausência de Sincronização Inicial de Estado ao Conectar):** Quando o Guest completa o handshake E2EE (`SESSION_READY`), o servidor envia apenas tokens de reconexão, sem despachar o estado acumulado da aba ativa (`tabState`), deixando o Guest em tela em branco caso o Host já tenha desenhado antes da conexão.

---

## 3. Evidências de Comandos e Reprodução Real

### 3.1 Reprodução do Erro H2 no Chrome Android (HTTP LAN sem polyfill)

Execução do script de diagnóstico emulando Motorola Edge 70 Pro (412x915, DPR 2.625, Touch) conectado via IP LAN `http://192.168.1.200`:

```powershell
node -e "
const { spawn } = require('child_process');
const p = spawn('C:/desenv/utils/OneToOneSupport/node_modules/electron/dist/electron.exe', [
  'C:/Users/alxch/.gemini/antigravity-cli/brain/5e3eaa40-ef84-4ec0-9015-c55abf0f3d84/scratch/diagnose-no-polyfill.cjs'
], {
  cwd: 'C:/desenv/utils/OneToOneSupport',
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  stdio: 'inherit'
});
p.on('exit', (code) => process.exit(code || 0));
"
```

**Saída Real Obtida:**
```text
[DB] Migração aplicada com sucesso: 001_init.sql
[DB] Migração aplicada com sucesso: 002_eventos_append_only.sql

--- Guest desenha traço com toque (com polyfill de randomUUID) ---
[Guest PageError] crypto.randomUUID is not a function
[Servidor] Total de eventos do Guest recebidos no servidor: 0
[Guest] Pixels visíveis no canvas do celular após traço: { nonWhitePixels: 436 }
[SQLite] Elementos no banco: 0 []
```

**Análise:**
No arquivo `src/shared/canvas/engine.ts` (linhas 425–437):
```typescript
this.canvas.on('path:created', (opt: any) => {
  const pathObj = opt.path;
  if (!pathObj) return;

  const elementId = crypto.randomUUID(); // <-- TypeError: crypto.randomUUID is not a function
  const pathData = pathObj.toObject();

  this.canvas.remove(pathObj);
  ...
  this.emitEvent(event);
});
```
Como `crypto.randomUUID()` é chamado diretamente no escopo global (e não `generateUUID()` de `protocol.ts`), no Chrome em HTTP o método não existe. O erro síncrono interrompe o listener, `this.emitEvent(event)` nunca roda, o reducer local não recebe o elemento e o WebSocket não envia nada. Na renderização seguinte do estado reativo (`renderState`), o canvas é limpo para bater com o estado do reducer (vazio), fazendo o traço sumir! O mesmo problema atinge ferramentas de retângulo, elipse, linha, seta e texto (linhas 509, 621, 667, 689, 716).

### 3.2 Reprodução da Perda de ID no SQLite (Hipótese B)

Com polyfill de `crypto.randomUUID` ativado no Guest:
```powershell
node "C:\Users\alxch\.gemini\antigravity-cli\brain\5e3eaa40-ef84-4ec0-9015-c55abf0f3d84\scratch\run-diag.mjs"
```

**Saída Real Obtida:**
```text
[Servidor] onGuestEvent recebido: DRAW_ADD {"id":"8abe1c7d-dc6a-4633-86ec-708810469e65","tipo":"path","data":{"type":"Path"...}}
[Servidor] Total de eventos do Guest recebidos no servidor: 1
[SQLite] Elementos no banco: 1 [ 'bf6c7a83-bdfc-44f2-a7ba-cf3eba9a2a93' ]
```

**Análise:**
O Guest gerou o elemento com ID `"8abe1c7d-dc6a-4633-86ec-708810469e65"`.
No banco SQLite, `reconstruirEstadoAba` identificou o elemento como `'bf6c7a83-bdfc-44f2-a7ba-cf3eba9a2a93'`.
Em `electron/server/index.ts` linha 101:
```typescript
const payloadData = envelope.payload?.data ?? envelope.payload;
```
Quando o evento chega com `{ id, tipo, data }`, `envelope.payload.data` existe, portanto `payloadData` é atribuído apenas a `data`. O `id` e o `tipo` do elemento são descartados. Ao persistir a string no SQLite, o reducer `reconstruirEstadoAba` encontra `payload.id === undefined` e recorre a `event.id` (ID da linha no SQLite), dessincronizando os IDs de elementos entre os dois dispositivos.

### 3.3 Falhas de Sincronização Host -> Guest

No arquivo `electron/ipc/evento.ipc.ts` (linhas 93–106):
```typescript
if (p.autor === 'host') {
  try {
    serverSessionController.broadcastToGuest({ ... });
  } catch {
    // Fallback silencioso se falhar envio cifrado
  }
}
```
O retorno booleano de `broadcastToGuest` é descartado, mascarando falhas quando `wsHandle` ou `cipher` não estão prontos.

Além disso, em `electron/server/ws.ts`, ao receber conexão após handshake (`SESSION_READY`), o servidor não transmite o snapshot ou histórico de eventos da aba ativa. Qualquer desenho feito antes do pareamento do QR Code nunca chega ao celular do atendido.

---

## 4. Causa Raiz Comum e Conclusão

A causa raiz comum de H1 e H2 é a **incompatibilidade do código compartilhado do Whiteboard com ambientes web HTTP de dispositivos móveis** (onde APIs seguras como `crypto.randomUUID` inexistem) combinada com a **ruptura do contrato de envelope de eventos no backend Electron** (extração incorreta de `payload.data`, supressão de eventos de `UNDO`/`REDO` e ausência de reconciliação de estado inicial no handshake).

### Ações de Correção Planejadas:
1. **Engine e Guest (H2):** Substituir todas as chamadas de `crypto.randomUUID()` em `src/shared/canvas/engine.ts`, `src/host/store/useHostStore.ts` e `src/guest/GuestRoom.tsx` pela função segura `generateUUID()` (definida em `src/shared/events/protocol.ts`), que utiliza CSPRNG `crypto.getRandomValues` quando `crypto.randomUUID` não está disponível.
2. **Persistência do Servidor (H1):** Em `electron/server/index.ts` (`handleGuestEvent`), preservar integralmente o payload `{ id, tipo, data }`, e incluir suporte a persistência e despacho de eventos `UNDO` e `REDO` emitidos pelo Guest.
3. **IPC e Broadcast (H1):** Em `electron/ipc/evento.ipc.ts`, remover o bloco silencioso e verificar o retorno booleano de `broadcastToGuest`, registrando avisos sem vazar dados sensíveis.
4. **Tratamento de UNDO/REDO no Host e Guest (H1):** Em `src/host/HostApp.tsx` e `src/guest/GuestRoom.tsx`, incluir tratamento explícito de eventos `UNDO` e `REDO` remotos nos respectivos listeners.
5. **Sincronização Inicial no Handshake (H1):** Ao enviar `SESSION_READY` para o Guest, transmitir os eventos acumulados ou o estado atual da aba ativa no quadro branco para que o convidado receba os desenhos pré-existentes.
