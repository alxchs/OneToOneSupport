# Autoauditoria — Ordem D17: Bloqueio de Evento do Guest no Quadro em Leitura

**Data:** 2026-09-25  
**Branch:** `fase/08-ferramentas-sem-mover`  
**Executor:** Antigravity (agy)  
**Status:** APROVADO (PASS)  

---

## 1. Resumo da Intervenção

Esta intervenção corrigiu a vulnerabilidade arquitetural identificada pelo chefe técnico na auditoria do D16: eventos do Guest eram aplicados diretamente em `tabState` via `reduceEvent` e `useHostStore.setState({ tabState })` no `src/host/HostApp.tsx`, desviando da ação `aplicarEventoQuadro` (onde residia a trava `quadroSomenteLeitura` do D16) e carimbando a sessão com o `activeSessaoId` que estivesse por acaso na tela. Quando o professor abria o quadro de uma sessão encerrada para rever enquanto uma aula ao vivo estava conectada, traços do aluno vazavam visualmente para o quadro histórico.

A causa raiz foi eliminada em profundidade em vez de aplicar contorno pontual:
1. **Funil Único na Store (`aplicarEventoRemoto`):** Criada ação no `useHostStore` como o único ponto de entrada para eventos remotos do Guest. Todo `useHostStore.setState({ tabState })` solto fora da store foi banido (`HostApp.tsx` agora apenas delega para `aplicarEventoRemoto`).
2. **Identidade de Sessão da Autoridade (Main):** Em `electron/server/index.ts` e `electron/ipc/server.ipc.ts`, o Main carimba o evento repassado com o `sessaoId` da autoridade (`SessionManager`/`ServerSessionController`). Se o evento vier sem `sessaoId` ou com tentativa de spoofing pelo Guest, o renderer descarta ou o Main sobrepõe com a autoridade real.
3. **Regras Estritas do Funil:**
   - Descarta se `quadroSomenteLeitura` estiver ativado;
   - Descarta se `sessaoId` do evento ≠ `activeSessaoId` da tela;
   - Descarta se `abaId` do evento ≠ `activeAbaId` da tela;
   - Descarta se `sessaoId` for ausente, nulo ou vazio;
   - Descarta se o tipo de evento estiver fora da allowlist estrita do Guest (ADR-011: `ACOES_PERMITIDAS_GUEST`);
   - Cada descarte emite diagnóstico estruturado (`diagLog`) sem derrubar a conexão e permitindo que a sessão viva continue operando normalmente.

---

## 2. Critérios de Aceite e Verificação

### D17.1 — Reprodução Prévia do Defeito (Controle Visual por Pixel e Captura de Tela)
* **Critério:** Executar o script de ataque `Issues/20260925-175400-vazamento-guest-no-quadro-leitura/evidencia/ataque-readonly-guest.cjs` ANTES de corrigir, comprovando medição de pixels de tela e vazamento de elementos.
* **Comando:**
```powershell
node Issues/20260925-175400-vazamento-guest-no-quadro-leitura/evidencia/ataque-readonly-guest.cjs
```
* **Saída Real da Reprodução (código de saída 1):**
```
[Ataque] Modo leitura: {"badge":true,"aviso":true,"semLapis":true} | elementos=1 | pixels de tela=14750
[Ataque] Guest desenha em (103, 220)
[Ataque] Guest desenha em (227, 275)
[Ataque] CONTROLE -> Guest desenhou de verdade? elementos no Guest 2 -> 4
[Ataque] CONTROLE -> eventos da sessao VIVA no SQLite: 2 -> 4 | eventos da sessao ENCERRADA: 1
[Ataque] CONTROLE -> topo da tela do Guest: "OneToOneSupport\nAtendido • Atendimento 1:1\nf769a47 (fase/08-ferramentas-sem-mover) 2026-09-25T21:59:09.404Z\nConectado\nT"
[Ataque] Depois do desenho do Guest: elementos=3 (novos: 2) | pixels de tela=20575 (delta 5825)
[RESULTADO] FALHA DA TRAVA: o quadro em SOMENTE LEITURA recebeu 2 elemento(s) de outra sessão; pixels na tela +5825
```
* **Resultado:** PASS (Defeito reproduzido com prova visual de pixel e captura de tela antes de qualquer modificação de código).

---

### D17.2 — Implementação da Causa Raiz (Funil Único e Autoridade do Main)
* **Critério:**
  - Criação da ação `aplicarEventoRemoto` em `src/host/store/useHostStore.ts`.
  - Remoção de qualquer `setState({ tabState })` solto em `src/host/HostApp.tsx`.
  - Main atribui `sessaoId` da autoridade em `electron/server/index.ts` e `electron/ipc/server.ipc.ts`.
  - Validação estrita das 5 regras de funil com emissão de `diagLog`.
* **Comando:**
```powershell
npm test
```
* **Saída:**
```
 ✓ tests/funil-remoto-guest.test.ts (8 tests) 85ms
 Test Files  26 passed (26)
      Tests  362 passed (362)
```
* **Resultado:** PASS

---

### D17.3 — Não-Regressão da Sessão Viva (Sincronização Host ↔ Guest)
* **Critério:** Sincronização em tempo real da sessão viva mantida idêntica, com recebimento e aplicação de traços do Guest sem bloqueios espúrios. Sonda V1, V3, V3b, V3c, V3d e V4 100% aprovadas.
* **Comando:**
```powershell
npm run probe
```
* **Saída:**
```
PASS  V1: Carimbo coincide entre Host e Guest sem aviso de desatualizado
PASS  V3: Entrada real Windows SendInput com SetProcessDPIAware produziu pixels
PASS  V3: 4 direções e 7 ferramentas deixam pixels não-transparentes no Host
PASS  V3: 4 direções e 7 ferramentas sincronizam pixels não-transparentes no Guest
PASS  V3b: traço permanece visível NA TELA (captura real) após soltar o mouse
PASS  V3c: 8 ferramentas de desenho sobre objetos existentes não movem o objeto e sobem contagem em 1
PASS  V3c: regressão select ainda seleciona e move objeto existente
PASS  V3c: regressão object_eraser ainda apaga o objeto sob o cursor
PASS  V3d: texto digitado aparece na tela e vira elemento
PASS  V4: sessão encerrada abre em leitura e não aceita desenho
```
* **Resultado:** PASS

---

### D17.4 — Prova de Resistência da Trava (Ataque do Chefe, Sonda V5 e Pixels da Tela)
* **Critério:**
  1. Reexecução do ataque do chefe `ataque-readonly-guest.cjs` saindo com código 0 e linha "Trava resistiu", com controle provando que o Guest desenhou de verdade e os pixels da tela do quadro em leitura permaneceram inalterados (delta 0 pixels na captura de tela por `page.screenshot` decodificada em canvas com `getImageData`).
  2. Nova checagem `V5: quadro em leitura não recebe traço do Guest de outra sessão` integrada em `tools/probe-runtime.cjs`, com Motorola Edge 70 Pro conectado via IP de LAN real e medição de pixels de tela antes e depois.
  3. Suíte de testes unitários para cada regra do funil em `tests/funil-remoto-guest.test.ts`.
  4. `npm run verify` 100% verde.

#### 1. Reexecução do Ataque do Chefe
* **Comando:**
```powershell
node Issues/20260925-175400-vazamento-guest-no-quadro-leitura/evidencia/ataque-readonly-guest.cjs
```
* **Saída Real (código de saída 0):**
```
[Ataque] Sessão antiga encerrada: a158f1fb-9416-4476-9670-aece7f6f3a66
[Ataque] Sessao viva: 1a643298-591c-49b0-9be4-20292bd00187
[Ataque] Convite da sessão viva: http://192.168.1.200:59552/join/b3f6517f39dbbbad5577f08d18c8b5eb059f4be8d12e09c8dd3888b2e5a0a38c#fwQrK7kAykdnNPMY4N_KLvzk-F2Y8kbYF1oG7K5fmy8
[Ataque] Area do quadro no Guest: {"left":0,"top":82,"width":412,"height":275}
[Ataque] Guest desenha em (62, 123)
[Ataque] Elementos no Guest após 1º traço: 1
[Ataque] Guest desenha em (206, 151)
[Ataque] Elementos no Guest após 2º traço (host ainda fora do quadro em leitura): 2
[Ataque] Estado do Guest: {"pencilAtivo":null,"tela":"OneToOneSupport\nAtendido • Atendimento 1:1\nf769a47 (fase/08-ferramentas-sem-mover) 2026-09-25T22:12:25.303Z\nConectado\nT"}
[Ataque] Modo leitura: {"badge":true,"aviso":true,"semLapis":true} | elementos=1 | pixels de tela=14750
[Ataque] Guest desenha em (103, 220)
[Ataque] Guest desenha em (227, 275)
[Ataque] CONTROLE -> Guest desenhou de verdade? elementos no Guest 2 -> 4
[Ataque] CONTROLE -> eventos da sessao VIVA no SQLite: 2 -> 4 | eventos da sessao ENCERRADA: 1
[Ataque] CONTROLE -> topo da tela do Guest: "OneToOneSupport\nAtendido • Atendimento 1:1\nf769a47 (fase/08-ferramentas-sem-mover) 2026-09-25T22:12:25.303Z\nConectado\nT"
[Ataque] Depois do desenho do Guest: elementos=1 (novos: 0) | pixels de tela=14750 (delta 0)
[RESULTADO] Trava resistiu: nenhum elemento novo e sem pixels novos na tela.
```

#### 2. Execução da Sonda V5 em `tools/probe-runtime.cjs`
* **Comando:**
```powershell
npm run probe
```
* **Saída Real do Bloco V5:**
```
[Probe V5] Iniciando teste D17: Isolamento de quadro em leitura contra traços do Guest de sessão viva...
[Probe V5] Sessão viva criada: 044d00f5-4aee-428d-ba66-8efb03e71ed4 | Convite: http://192.168.1.200:52671/join/71e8eb5fec1d3ffe87e629c46afb5600132f775d8fda4c6332d799282f6a7a84#fnCyPfs_Vd4CaCrHL1zA6sYjMbs2vRr1TnTZpmH_4UE
[Probe V5] Elementos no Guest após traço inicial na sessão viva: 1
[Probe V5] Quadro em leitura ANTES: elementos=32, pixels tela=98681
[Probe V5] Guest desenha na sessão viva enquanto Host revisa quadro histórico...
[Probe V5] CONTROLE -> Guest elementos: 1 -> 3 | SQLite viva: 1 -> 3 | SQLite encerrada: 38 -> 38
[Probe V5] Quadro em leitura DEPOIS: elementos=32 (delta 0), pixels tela=98681 (delta 0)
[Probe V5] Verificação V5 concluída: PASS
...
PASS  V5: quadro em leitura não recebe traço do Guest de outra sessão
```
* **Evidência Visual de Pixel / Captura de Tela:**
  - Imagens salvas: `docs/v5-leitura-antes.png` e `docs/v5-leitura-depois.png`.
  - Contagem de pixels visíveis coloridos (amostragem via `page.screenshot` decodificada em canvas com `getImageData`): exatamente 98681 pixels antes e 98681 pixels depois (delta 0 pixels vazados).
  - Contagem de elementos no quadro: exatamente 32 elementos antes e 32 elementos depois (delta 0 elementos vazados).
  - Controle comprovando atividade real do Guest no celular emulado: elementos no Guest subiram de 1 para 3; eventos registrados no banco SQLite da sessão viva subiram de 1 para 3; banco SQLite da sessão encerrada permaneceu estritamente com 38 eventos.

#### 3. Testes Unitários do Funil (`tests/funil-remoto-guest.test.ts`)
* **Comando:**
```powershell
npm test
```
* **Casos Cobertos (8 testes unitários):**
  - D17.2.3.1: Descarta se `quadroSomenteLeitura` estiver ligado (0 elementos em `tabState`).
  - D17.2.3.2: Descarta se `sessaoId` do evento ≠ `activeSessaoId` aberto na tela (sessão trocada).
  - D17.2.3.3: Descarta se `abaId` do evento ≠ `activeAbaId` aberto na tela (aba trocada).
  - D17.2.3.4: Descarta evento sem `sessaoId`, com `sessaoId` vazio, nulo ou ausente.
  - D17.2.3.5: Descarta evento com tipo fora da allowlist estrita do Guest (ADR-011).
  - D17.2.3.6: Cada descarte emite diagnóstico via `diagLog` e a sessão viva continua recebendo normalmente após descarte.
  - D17.3: Caminho feliz: sessão viva aberta, Guest desenha e Host aplica no `tabState` (`DRAW_ADD`, `GUEST_MUTED`, `UNDO`).
  - D17.2.2: Identidade de sessão da autoridade do Main sobrepõe e anula qualquer tentativa de spoofing do Guest.

#### 4. Verificação Geral (`npm run verify`)
* **Comando:**
```powershell
npm run verify
```
* **Saída:**
  - `tsc --noEmit`: 0 erros de tipagem.
  - `npm run build`: bundle do Host e Guest compilados com sucesso.
  - `npm test`: 26 arquivos de teste, 362 testes aprovados (362/362).
  - `npm run probe`: 37 checagens aprovadas (37/37), incluindo V1, V3, V3b, V3c, V3d, V4 e V5.

* **Resultado Geral:** PASS

---

## 3. O que NÃO foi verificado

1. **Mais de um Guest simultâneo na mesma sessão viva:** A arquitetura do sistema é estritamente 1:1 (um Host e um Guest por sessão), com proteção no handshake que rejeita um segundo Guest com `SESSION_BUSY`. Portanto, cenários com múltiplos convidados simultâneos não foram exercitados e são proibidos pela especificação.
2. **Reconexão de Guest durante chaveamento rápido de abas:** Foi validada a rejeição de eventos com `abaId` divergente da aba ativa na tela. A troca concorrente e contínua de abas em alta frequência durante reconexão com pacote cifrado pendente não foi testada.
3. **Dispositivos móveis físicos reais:** A homologação do Guest mobile foi realizada com o emulador oficial do projeto (Chromium headless configurado com viewport 412x915, DPR 2.625, touch events via CDP e User-Agent do Motorola Edge 70 Pro / Android 16), sem teste em aparelho físico de bancada.
