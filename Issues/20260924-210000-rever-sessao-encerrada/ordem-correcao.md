Contexto: LEIA AGENTS.md e `Issues/20260924-210000-rever-sessao-encerrada/LEIA-ME.md`. Continue na branch
`fase/08-ferramentas-sem-mover` (ou na branch corrente da fase). Não faça push nem merge. Escopo: Host.

## D16 — Rever, em modo leitura, o quadro de uma sessão encerrada

### D16.1 — Interface
Na tela de detalhes do atendido, cada sessão ENCERRADA passa a ter um botão para abrir o quadro dela em
modo somente leitura (ex.: id `btn-rever-quadro-<id da sessão>`, rótulo claro como "Ver quadro (somente
leitura)"). A sessão ativa continua exatamente como está hoje.

### D16.2 — Modo somente leitura (o ponto crítico)
O log de eventos é append-only: uma sessão encerrada NÃO pode receber evento novo, nem por acidente.
1. Nenhuma ação que gere evento pode estar disponível: desenhar, apagar, desfazer, refazer, limpar, texto.
   Esconda ou desabilite esses controles; não confie só em esconder o botão — garanta também no motor/store
   que nenhum `DRAW_*`, `UNDO`, `REDO` ou `CLEAR_TAB` seja emitido nesse modo.
2. Nada de sala LAN/Guest: não ofereça iniciar servidor, bloquear tela nem liberar mídia.
3. O que DEVE funcionar: ver o desenho como ficou, e **Exportar PNG** (é justamente para isso que o
   profissional volta à sessão).
4. Deixe visível na tela que é modo leitura (ex.: um rótulo "Somente leitura — sessão encerrada"), para o
   profissional não achar que está desenhando e perder trabalho.

### D16.3 — Como carregar o estado (não crie IPC novo)
Use o que já existe: `desktopAPI.eventos.obterEstadoAba(sessaoId, abaId)`, do mesmo jeito que
`abrirQuadroSessao` já faz na store. NÃO use `salvarRevisao`/`carregarRevisao` (recurso de versões, fora
deste escopo) e NÃO crie canal IPC novo. Se concluir que é inevitável criar algo novo, justifique por
escrito antes.

### D16.4 — Prova
1. Teste de ponta a ponta: criar sessão, desenhar N elementos, encerrar a sessão, abrir o quadro em modo
   leitura e afirmar que os N elementos aparecem — com captura de TELA (`page.screenshot`), não só contagem
   de objetos.
2. Teste de que o modo leitura não grava nada: com o quadro aberto em leitura, tentar desenhar (arrastar o
   mouse sobre o canvas) e afirmar que (a) nenhum elemento novo aparece e (b) a contagem de eventos no
   SQLite daquela sessão não mudou (compare antes/depois).
3. Teste de que a exportação PNG funciona no modo leitura.
4. Regressão: a sessão ATIVA continua funcionando como antes (desenhar, desfazer, borracha, servidor LAN);
   `npm run verify` e a sonda (V3, V3b, V3c) verdes.
5. Acrescente uma checagem à sonda (`tools/probe-runtime.cjs`), ex. `V4: sessão encerrada abre em leitura e
   não aceita desenho`, para não regredir.

## Proibido
Não altere o formato dos eventos nem o schema do banco. Não reabra a sessão encerrada como ativa. Não
invente nomes de arquivo, função, canal IPC ou botão que não existam sem criá-los de fato.

## Ao final
`npm run verify` verde; `docs/reviews/autoauditoria-rever-sessao.md` (critério → comando → saída real →
PASS/FAIL e o que NÃO foi verificado); `docs/HANDOFF.md` com parágrafo curto em português simples para o
dono; commit local único, sem push.
