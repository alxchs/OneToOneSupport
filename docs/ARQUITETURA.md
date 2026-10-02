# Arquitetura do Sistema OneToOneSupport — V1.0

Este documento descreve a arquitetura técnica, as camadas de execução, os modelos de dados relacionais e as garantias de segurança do **OneToOneSupport**, lidos e conferidos diretamente a partir do código-fonte da aplicação.

---

## 1. Visão Geral das Camadas de Execução

O sistema é dividido em três domínios principais de execução, mantendo estrito desacoplamento entre regras de negócio e interface visual:

```
+-----------------------------------------------------------------------------------+
|                                  PROCESSO PRINCIPAL (MAIN)                        |
|                                                                                   |
|  - Electron Main Runtime (Node.js ABI 123)                                       |
|  - Repositórios e Serviços de Domínio (Atendidos, Sessoes, Abas, Assets, Eventos)|
|  - Banco de Dados SQLite Relacional (better-sqlite3 + migrations SQL)             |
|  - Servidor HTTP Express 4 (Porta Dinâmica 0, Rota /midia com Range Requests)     |
|  - Servidor WebSocket (ws) com Handshake E2EE (X25519) e Cifragem ChaCha20-Poly  |
|  - Gerador de Relatório PDF Offscreen (Electron webContents.printToPDF nativo)    |
|  - Firewall Manager (Regras NSIS no perfil Privado para o executável)             |
+-----------------------------------------------------------------------------------+
        ^                                               ^
        | IPC Seguro (contextBridge)                    | WebSocket LAN Cifrado (E2EE)
        v                                               v
+------------------------------------+        +-------------------------------------+
|      RENDERER PROCESS (HOST)       |        |        GUEST MOBILE CLIENT          |
|                                    |        |                                     |
| - React 18 + Zustand Store         |        | - React 18 Mobile-First             |
| - WhiteboardEngine (Fabric.js 6)   |        | - WhiteboardEngine (Guest Mode)     |
| - Canvas HiDPI (DPR 150% 4K aware) |        | - Touch Events nativos (48x48px min)|
| - PDF.js Canvas Background Viewer  |        | - Libsodium WebAssembly (crypto_kx) |
| - Zero regra de negócio / Sem SQL  |        | - CSP Estrita com wasm-unsafe-eval  |
+------------------------------------+        +-------------------------------------+
```

---

## 2. Esquema Relacional de Dados (SQLite)

O banco de dados SQLite é inicializado em `%APPDATA%\OneToOneSupport\onetoone.db` (ou configurável via `ONETOONE_DB_PATH`) e controlado por migrações em `dist/electron/db/migrations/`:

### 2.1. Tabelas (`001_init.sql`)
1. **`ConfiguracaoGlobal`**: `chave TEXT PRIMARY KEY`, `valor TEXT NOT NULL`, `atualizado_em INTEGER NOT NULL`.
2. **`Atendidos`**: `id TEXT PRIMARY KEY`, `nome TEXT NOT NULL`, `contato TEXT`, `email TEXT`, `notas TEXT`, `ativo INTEGER NOT NULL DEFAULT 1`, `deletado_em INTEGER`, `criado_em INTEGER NOT NULL`, `atualizado_em INTEGER NOT NULL`.
3. **`Sessoes`**: `id TEXT PRIMARY KEY`, `atendido_id TEXT NOT NULL REFERENCES Atendidos(id)`, `titulo TEXT`, `status TEXT NOT NULL`, `iniciado_em INTEGER NOT NULL`, `encerrado_em INTEGER`, `notas_host TEXT`.
4. **`Sessoes_Revisoes`**: `id TEXT PRIMARY KEY`, `sessao_id TEXT NOT NULL REFERENCES Sessoes(id)`, `numero_versao INTEGER NOT NULL`, `snapshot_evento_idx INTEGER NOT NULL`, `titulo TEXT`, `criado_em INTEGER NOT NULL`, `autor TEXT NOT NULL`.
5. **`Abas`**: `id TEXT PRIMARY KEY`, `sessao_id TEXT NOT NULL REFERENCES Sessoes(id)`, `tipo TEXT NOT NULL`, `ordem INTEGER NOT NULL`, `asset_id TEXT`, `titulo TEXT`, `criado_em INTEGER NOT NULL`.
6. **`Eventos`**: `id TEXT PRIMARY KEY`, `sessao_id TEXT NOT NULL REFERENCES Sessoes(id)`, `aba_id TEXT`, `tipo TEXT NOT NULL`, `payload TEXT NOT NULL`, `autor TEXT NOT NULL`, `criado_em INTEGER NOT NULL`.
7. **`Assets`**: `id TEXT PRIMARY KEY`, `sessao_id TEXT REFERENCES Sessoes(id)`, `tipo TEXT NOT NULL`, `mime TEXT NOT NULL`, `tamanho INTEGER NOT NULL`, `hash_sha256 TEXT NOT NULL`, `path TEXT NOT NULL`, `criado_em INTEGER NOT NULL`.

### 2.2. Imutabilidade e Append-Only (`002_eventos_append_only.sql`)
A tabela `Eventos` implementa Event Sourcing imutável protegido por triggers de integridade do SQLite:
- **`trg_eventos_prevent_update`**: Dispara `RAISE(ABORT, 'Eventos e append-only: UPDATE proibido')` em qualquer tentativa de UPDATE.
- **`trg_eventos_prevent_delete`**: Dispara `RAISE(ABORT, 'Eventos e append-only: DELETE proibido')` em qualquer tentativa de DELETE.
- **`idx_eventos_sessao_criado_em`**: Índice composto `(sessao_id, criado_em)` para reconstrução determinística rápida de abas e quadros.

### 2.3. Prevenção de Duplicidade (Regra Inegociável #1)
Todas as operações de inserção/atualização de entidades em `ConfiguracaoGlobal` e `Atendidos` utilizam `WHERE NOT EXISTS` comparando todas as colunas de negócio, com operadores `IS` para colunas anuláveis (`contato`, `email`, `notas`, `deletado_em`), impedindo registros fantasmas no banco relacional.

---

## 3. Protocolo WebSocket e Matriz de Autoridade

A comunicação entre o aplicativo Host e o Guest mobile ocorre por WebSocket sobre envelope padronizado com cifragem E2EE (`ChaCha20-Poly1305` + `X25519`):

### 3.1. Tipos Canônicos de Mensagem (`src/shared/events/protocol.ts`)
- **Transporte / Conexão:** `AUTH`, `HANDSHAKE_INIT`, `ENCRYPTED`, `CLOCK_SYNC`, `RECONNECT`, `ERROR`.
- **Ações Exclusivas do Host (`ACOES_EXCLUSIVAS_HOST`):**
  - `CLEAR_TAB`: Limpeza total de elementos da aba.
  - `LOCK_SCREEN`: Bloqueio interativo da tela do Guest com exibição de overlay.
  - `UNLOCK_MEDIA`: Destravamento dos controles de reprodução de áudio e vídeo no celular.
  - `TAB_SWITCH`: Comutação da aba ativa.
  - `SCREEN_LOCKED`: Notificação de estado de trava.
  - `PDF_PAGE`: Mudança de página de documento PDF (exclusividade do profissional).
- **Ações Interativas do Guest (`ACOES_INTERATIVAS_GUEST`):**
  - `DRAW_ADD`: Adição de traço, forma geométrica ou texto.
  - `DRAW_HIDE`: Ocultação lógica por borracha de trecho ou desfazer.
  - `UNDO`, `REDO`: Desfazer e refazer cooperativo.
- **Ações de Mídia do Guest (`ACOES_MIDIA_GUEST`):**
  - `PLAY`, `PAUSE`, `SEEK`, `MEDIA_CONTROL` (apenas ativas quando `mediaUnlocked === true`).
- **Ações Locais de Privacidade (`ACOES_LOCAIS_GUEST`):**
  - `GUEST_MUTED`: Mudo de microfone local (preservado mesmo sob tela bloqueada).

### 3.2. Funil de Validação de Autoridade (`src/shared/autoridade.ts` / ADR-011)
Toda mensagem do convidado passa pela função pura `canGuestExecuteAction` e pelo validador central `validarAutorEPermissaoCompartilhada`. Ações não autorizadas são sumariamente descartadas com erro tipado, protegendo o sistema contra poluição de protótipo (`__proto__`, `constructor`) e spoofing de autoridade.

---

## 4. Gestão Segura de Mídia e Streaming Local

- **Serviço de Mídia:** Rota `GET /midia/:assetId` servida pelo Express no processo Main.
- **Range Requests:** Suporte a cabeçalhos `Range: bytes=start-end`, respondendo com status 206 (Partial Content) para áudio/vídeo e status 416 para faixas inválidas.
- **Segurança e Isolamento:** Cada acesso exige token temporário de 32 bytes gerado com CSPRNG pelo `SessionManager`, validado via `crypto.timingSafeEqual` para imunidade contra ataques de temporização.
- **Integridade Atômica:** Assets são validados por assinatura de bytes (magic bytes), banindo arquivos SVG e tipos desconhecidos. O hash SHA-256 é conferido antes da persistência física e mantido imutável pós-sessão.

---

## 5. Geração de Relatórios em PDF (ADR-015)

- **Renderizador Nativo:** Implementado via janela fora de tela (`BrowserWindow` offscreen) utilizando a API nativa do Electron (`webContents.printToPDF`).
- **Eliminação de Puppeteer em Produção:** O empacotamento descarta ferramentas externas de automação, utilizando o próprio motor Chromium já presente no Electron.
- **Fidelidade Gráfica HiDPI:** O renderizador instancia o `WhiteboardEngine` e o `PdfDocumentViewer` com fontes do sistema e exporta miniaturas fiéis em PNG para o documento final, sem consultar CDNs externas.
- **Gravação Atômica:** O arquivo final é gravado atomicamente na pasta padronizada da sessão (`<raiz>/<slug>/<pasta_sessao>/relatorio.pdf`).

---

## 6. Guia de Release e Empacotamento

### 6.1. Pré-Requisitos de Release
1. Garantir que todas as alterações estão commitadas na branch de trabalho.
2. Executar a suíte completa de testes e sonda de automação:
   ```bash
   npm run verify
   ```
3. Executar o validador do kit-orquestrador:
   ```bash
   node tools/auditar.cjs
   ```

### 6.2. Procedimento de Empacotamento
1. Incrementar a versão no arquivo `package.json` caso necessário.
2. Executar a compilação e empacotamento com electron-builder:
   ```bash
   npm run package
   ```
3. O comando gera em `release/`:
   - `OneToOneSupport Setup <versão>.exe`: Instalador guiado NSIS com integração com o Firewall do Windows.
   - `OneToOneSupport <versão>.exe`: Executável portátil autônomo.

### 6.3. Checklist de Publicação
- [ ] Binário testado em pasta limpa com dados reais.
- [ ] Módulos nativos (`better-sqlite3`, `sodium-native`) desempacotados em `app.asar.unpacked/`.
- [ ] Migrations presentes em `dist/electron/db/migrations/`.
- [ ] Regra de firewall restrita ao perfil Privado criada na instalação e removida na desinstalação.
- [ ] Latência local de traços e mídia confirmada em < 200 ms no percentil 95 (p95).

---

## 7. Representação Vetorial dos Elementos e Sensação de Paint (Fase 11)

No aplicativo, a experiência visual do quadro é desenhada para funcionar como uma folha física (estilo Paint do Windows), onde o usuário nunca é exposto a caixas de seleção, alças de agarrar ou cursores de arrasto durante o desenho. Internamente, no entanto, os elementos continuam estritamente vetoriais via Fabric.js e eventos append-only (`DRAW_ADD` e `DRAW_HIDE`).

Essa decisão arquitetural é mandatória e preserva cinco garantias essenciais do sistema:
1. **Sincronização bidirecional em tempo real (sync):** Eventos leves transmitem apenas o payload com coordenadas e geometria sem trafegar bitmaps pesados pela rede LAN.
2. **Desfazer e refazer (undo/redo):** Histórico de eventos estruturados permite desfazer e refazer de forma atômica e determinística via reducer puro.
3. **Persistência e integridade relacional (histórico SQLite):** Reconstituição exata da sessão a partir da tabela imutável `Eventos`.
4. **Relatório consolidado em PDF:** Renderização nítida via `webContents.printToPDF` com miniaturas fiéis em alta resolução sem perda de qualidade gráfica ou pixelização.
5. **Suporte a HiDPI (4K @ 150%):** Traços vetoriais escalam com fidelidade matemática baseando-se em `window.devicePixelRatio`.
