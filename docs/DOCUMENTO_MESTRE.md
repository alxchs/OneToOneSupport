# 📘 ONETOONESUPPORT — DOCUMENTO MESTRE v2.0

## Arquitetura, Diretrizes de Desenvolvimento e Protocolo de Colaboração entre IAs

**Projeto:** OneToOneSupport — Plataforma Desktop de Atendimento Remoto 1:1 Multimodal
**Versão:** 2.0 (consolidada com E2EE, event sourcing e regras de persistência)
**Status:** Aprovado para scaffolding
**Classificação:** Especificação Técnica de Produção (SDD/PRD)

## 🛑 REGRAS AMBIENTAIS E TÉCNICAS INEGOCIÁVEIS

1. **Validação Estrita de Duplicidade (SQLite):** É expressamente proibido inserir dados (especialmente nas tabelas `ConfiguracaoGlobal` e `Atendidos`) usando apenas chaves primárias ou constraints simples. A camada de repositório (DAL) deve obrigatoriamente montar queries de verificação utilizando cláusulas `EXISTS` / `NOT EXISTS`. A avaliação de duplicidade deve testar a igualdade de **todas as colunas da tabela** (ignorando apenas a chave primária UUID e timestamps de auditoria) antes de autorizar um `INSERT` ou `UPDATE`.

2. **Ambiente de Exibição do Host (Electron):** A máquina hospedeira roda impreterivelmente com resolução **3840 x 2160 com 150% de display scaling**. A janela do Electron e, principalmente, as instâncias do `Fabric.js` devem ser explicitamente codificadas para ler o `window.devicePixelRatio`, multiplicando as dimensões virtuais pelas reais para evitar borrões, serrilhados ou desalinhamento das coordenadas de clique/touch no canvas.

3. **Ambiente de Exibição do Guest (Mobile):** O frontend do Guest acessa via navegador. Todo o CSS, Tailwind e touch events devem rodar perfeitamente em dispositivos premium modernos, com alvo exato de homologação mental um **Motorola Edge 70 Pro rodando Android 16**, com menus de sistema nativamente em inglês.

4. **Controle de Versão Local:** **Git Bash 2.52** com prompts de timestamp customizados; remotos no **GitHub** (decisão do Alexandre, ver docs/ADR/007; substitui o AWS CodeCommit do texto original). Os `.gitignore` devem ser exaustivos e preparados para Node, React, Electron e builds C++ nativos (`better-sqlite3`, `sodium-native`), evitando travar commits no remoto.

## 1. PROPÓSITO
Referência mestra do projeto. **Regra de divergência:** quando uma implementação precisar divergir desta especificação, registrar em um ADR e justificar no bloco `[HANDOFF DE ESTADO]`. Nunca alterar a stack sem justificativa estrutural.

## 2. CONCEITO DO PRODUTO
Plataforma desktop de atendimento remoto individual (1:1) unindo CRM local-first, quadro branco vetorial event-sourced e conectividade E2EE:
1. **CRM verticalizado** com histórico de atendimentos, cadastro de pessoas e relatórios.
2. **Colaboração em tempo real** com quadro branco vetorial, abas multimodais e sincronia de mídia.
3. **Persistência local-first** com arquivamento estruturado por atendido e versionamento de sessões.

## 3. TERMINOLOGIA
* **Host:** profissional que inicia a sessão e controla o ambiente. Roda o app desktop.
* **Guest:** pessoa atendida; entra via navegador. Não instala nada.
* **Sessão:** um atendimento completo, do início ao encerramento.
* **Revisão:** versão imutável do estado da sessão em um momento específico.
* **Dicionário Dinâmico (White-Label):** nomenclatura configurável globalmente na tabela `ConfiguracaoGlobal` (chave-valor). Ex.: Psicólogo/Paciente, Professor/Aluno. Não existe tabela `TiposAtendido`.

## 4. PRINCÍPIOS NÃO-NEGOCIÁVEIS
* **Separação Estrita de Camadas:** nenhuma regra de negócio no Renderer. Renderer renderiza UI, captura input, chama IPC/WS e aplica estado. Lógica no Main Process (Domain Services).
* **Event Sourcing Append-Only:** estado do quadro NÃO é armazenado renderizado; é derivado de log de eventos imutável. Resolve undo/redo, revisões e borracha (não deleta, esconde).
* **Autoridade do Host:** ações do Guest são validadas pelo Host.
* **Local-First:** nenhum dado sai da máquina do Host.
* **Revisões Imutáveis:** reabrir uma sessão e salvar cria nova revisão.

## 5. STACK DEFINITIVA
| Camada | Decisão |
| --- | --- |
| Desktop Shell | Electron 30+ |
| Main Process | Node 20 LTS |
| Servidor HTTP | Express 4 (streaming, Range Requests) |
| Real-time | `ws` puro |
| Frontend | React 18 + Vite + TypeScript |
| Estado global | Zustand |
| Canvas | Fabric.js 6.x |
| Persistência | better-sqlite3 + `fs` |
| Criptografia E2EE | sodium-native (libsodium): X25519 + ChaCha20-Poly1305 |
| PDF | Puppeteer |

## 6. ARQUITETURA E2EE
Mesmo com WSS, o conteúdo não deve ser legível por um Relay na web.
1. Host gera par efêmero X25519 `(sk_h, pk_h)`.
2. Host embute `pk_h` no convite: `https://relay.onetoonesupport.app/join/<token>#<pk_h_base64>`. O fragmento `#` nunca vai ao servidor.
3. Guest gera par efêmero `(sk_g, pk_g)`, deriva `shared_secret = ECDH(sk_g, pk_h)`.
4. Guest envia `pk_g` no handshake.
5. Host deriva `shared_secret = ECDH(sk_h, pk_g)`.
6. Todas as mensagens usam ChaCha20-Poly1305, envelopadas como:
```
{ "v": 1, "id": "uuid", "ts": 1731000000000, "type": "ENCRYPTED",
  "payload": { "nonce": "base64-12-bytes", "ciphertext": "base64-aead-chunks" } }
```

## 7. COMUNICAÇÃO E PROCESSOS
Main Process contém: IPC Router ↔ Express+WS Server; Domain Services ↔ Session Manager; ambos sobre SQLite (better-sqlite3) + fs (assets). Dois renderers: Host (React) e Guest (navegador).

## 8. DADOS (EVENT SOURCING)
* Lápis, Pincel, Texto emitem `DRAW_ADD`.
* Borracha não deleta: emite `DRAW_HIDE` (invisibilidade lógica).
* Limpar Tela emite `CLEAR_TAB`.
* Snapshot a cada N interações ou ao fim da sessão; estado = último snapshot + eventos do delta.

## 9. ESQUEMA SQLITE (seguir estritamente)
```sql
CREATE TABLE ConfiguracaoGlobal (
  chave TEXT PRIMARY KEY,
  valor TEXT NOT NULL,
  atualizado_em INTEGER NOT NULL
);
CREATE TABLE Atendidos (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  contato TEXT,
  email TEXT,
  notas TEXT,
  ativo INTEGER NOT NULL DEFAULT 1,
  deletado_em INTEGER,
  criado_em INTEGER NOT NULL,
  atualizado_em INTEGER NOT NULL
);
CREATE TABLE Sessoes (
  id TEXT PRIMARY KEY,
  atendido_id TEXT NOT NULL,
  titulo TEXT,
  status TEXT NOT NULL,
  iniciado_em INTEGER NOT NULL,
  encerrado_em INTEGER,
  notas_host TEXT,
  FOREIGN KEY(atendido_id) REFERENCES Atendidos(id)
);
CREATE TABLE Sessoes_Revisoes (
  id TEXT PRIMARY KEY,
  sessao_id TEXT NOT NULL,
  numero_versao INTEGER NOT NULL,
  snapshot_evento_idx INTEGER NOT NULL,
  titulo TEXT,
  criado_em INTEGER NOT NULL,
  autor TEXT NOT NULL,
  FOREIGN KEY(sessao_id) REFERENCES Sessoes(id)
);
CREATE TABLE Abas (
  id TEXT PRIMARY KEY,
  sessao_id TEXT NOT NULL,
  tipo TEXT NOT NULL, -- 'blank', 'image', 'pdf', 'video', 'audio'
  ordem INTEGER NOT NULL,
  asset_id TEXT,
  titulo TEXT,
  criado_em INTEGER NOT NULL,
  FOREIGN KEY(sessao_id) REFERENCES Sessoes(id)
);
CREATE TABLE Eventos (
  id TEXT PRIMARY KEY,
  sessao_id TEXT NOT NULL,
  aba_id TEXT,
  tipo TEXT NOT NULL,
  payload TEXT NOT NULL,
  autor TEXT NOT NULL,
  criado_em INTEGER NOT NULL,
  FOREIGN KEY(sessao_id) REFERENCES Sessoes(id)
);
CREATE TABLE Assets (
  id TEXT PRIMARY KEY,
  sessao_id TEXT,
  tipo TEXT NOT NULL,
  mime TEXT NOT NULL,
  tamanho INTEGER NOT NULL,
  hash_sha256 TEXT NOT NULL,
  path TEXT NOT NULL,
  criado_em INTEGER NOT NULL,
  FOREIGN KEY(sessao_id) REFERENCES Sessoes(id)
);
```

## 10. REGRAS DE NEGÓCIO E DUPLICIDADE
* **Verificação Estrita `EXISTS`:** `.createAtendido(data)` executa `INSERT ... WHERE NOT EXISTS (SELECT 1 FROM Atendidos WHERE nome = ? AND contato = ? AND email = ? ...)` mapeando todas as propriedades de negócio.
* **Soft Delete:** apenas marca `ativo=0`. Exclusão física só se `encerrado_em` > 10 anos.
* **Arquivamento de Assets:** no encerramento, assets copiados para `%APPDATA%/OneToOneSupport/atendidos/<slug_atendido>/<YYYYMMDD_HHMM_sessao_id>/`.

## 11. SESSÃO 1:1 E WEBSOCKETS
* Host emite URL + QR Code. `guest_token` (32 bytes) é one-shot, invalidado pós-join.
* Guest perde conexão → `reconnect_token` (TTL 5 min).
* Guest só desenha, desfaz a própria ação e controla mídia SE o Host emitir `UNLOCK_MEDIA`.
* Qualquer `seek`, `play`, `pause` emite evento WS. Servidor é o relógio mestre.
* Volume e equalização são locais. Mute no Guest emite `GUEST_MUTED` só para notificar a UI do Host.

## 12. QUADRO BRANCO MULTIMODAL
* Fundo branco estático. Engine Fabric.js 6.x.
* **Obrigatória** a compensação HiDPI (Regra #2) com `canvas.setDimensions({ width, height }, { cssOnly: true })` ajustando manipuladores por `window.devicePixelRatio`.
* Ferramentas: Lápis, Pincel, Formas geométricas, Texto rotacionável. Flood fill fora do escopo.
* Undo/Redo varre a árvore de Event Sourcing.

## 13. RELATÓRIOS PDF
Template HTML via Puppeteer. Contém: nome dinâmico, dados cadastrais, anotações de aba, observações do Host e miniaturas (Fabric `.toDataURL()`).

## 14. SEGURANÇA, REDE E CICLO DE VIDA
* CSP estrita no Guest (`default-src 'self'`).
* Sanitização profunda de nomes de arquivos (path traversal).
* Firewall do Windows configurado para permitir a porta dinâmica do Express.

## 15. ESTRUTURA DE PASTAS ALVO
```
onetoonesupport/
├── package.json  electron-builder.yml  tsconfig.base.json  .gitignore
├── electron/  main.ts  preload.ts
│   ├── ipc/ router.ts atendido.ipc.ts sessao.ipc.ts
│   ├── server/ http.ts ws.ts session-manager.ts
│   ├── crypto/ handshake.ts cipher.ts
│   ├── services/ atendido.service.ts
│   └── db/ connection.ts  migrations/001_init.sql  repositories/atendido.repo.ts
├── src/
│   ├── host/ pages/ store/ ipc/
│   ├── guest/ JoinFlow.tsx GuestRoom.tsx ws/
│   └── shared/ canvas/engine.ts  crypto/  events/
└── docs/ HANDOFF.md  ADR/
```

## 16. PROTOCOLO WEBSOCKET (v1)
| Tipo | Origem | Ação |
| --- | --- | --- |
| `AUTH` | Guest | Validação de token (texto claro) |
| `HANDSHAKE_INIT` | Guest | Chaves ECDH (texto claro) |
| `ENCRYPTED` | Ambos | Payload envelopado via ChaCha20 |
| `DRAW_ADD` | Ambos | (Cifrado) adiciona SVG/JSON ao canvas |
| `DRAW_HIDE` | Ambos | (Cifrado) oculta elemento (borracha) |
| `LOCK_SCREEN` | Host | (Cifrado) bloqueia UI do Guest |
| `UNLOCK_MEDIA` | Host | (Cifrado) libera botões de vídeo/imagem |
| `TAB_SWITCH` | Host | (Cifrado) altera aba ativa em sincronia |

## 17. PROTOCOLO DE HANDOFF
Ao concluir um raciocínio, criar arquivo ou modificar lógica, encerrar a resposta com:
```
[HANDOFF DE ESTADO]
* Arquivos Modificados/Criados: [caminho/exato/do/arquivo.ts]
* Estado Atual: [explicação técnica detalhada]
* Próximo Passo Lógico: [comando exato do que a próxima IA deve codificar]
* Decisões Críticas Tomadas: [integrações, lógica EXISTS, cálculo do devicePixelRatio, etc.]
* Divergências da Spec: [se houver, justificar em ADR]
```

## 18. ROADMAP E CRITÉRIOS DE ACEITE
**V1.0:** Core 1:1, quadro branco vetorial HiDPI, mídias sincronizadas, E2EE, event sourcing, geração de PDF.
Critérios: binário executando no Windows; sincronia de traços e mídia < 200 ms em rede local; testes de duplicidade via `EXISTS` provando ausência de lixo no banco; assets copiados fisicamente para `%APPDATA%` pós-sessão.
