# AGENTS.md — regras para qualquer IA neste repositório (Antigravity, Claude Code, etc.)

Fonte de verdade: `docs/DOCUMENTO_MESTRE.md`. Plano: `docs/FASES.md`. Fluxo: `docs/PROTOCOLO.md`.
Antes de qualquer trabalho leia os três, mais `docs/HANDOFF.md` (estado atual), `docs/ADR/` e `docs/LICOES.md`.
Nota: Os procedimentos de chefe/auditor estão agora carregados como skills em `.agents/skills/`.

## Regras inegociáveis (resumo — o texto completo está no Documento Mestre)
1. **Duplicidade SQLite:** todo INSERT/UPDATE em `ConfiguracaoGlobal` e `Atendidos` passa por `WHERE NOT EXISTS`
   comparando TODAS as colunas de negócio (exceto PK e timestamps). Colunas anuláveis comparam com `IS`, nunca `=`.
2. **Host 3840x2160 @150%:** canvas/Fabric.js sempre leem `window.devicePixelRatio`.
3. **Guest:** homologação mental = Motorola Edge 70 Pro, Android 16, sistema em inglês. Mobile-first, touch events.
4. **Git:** Git Bash 2.52, remoto GitHub (ADR-007; o Mestre dizia AWS CodeCommit). **Nunca `git push` sem confirmação explícita do Alexandre naquele momento, salvo a exceção de fim de fase abaixo (seção Git).**
5. **Sem regra de negócio no Renderer.** Lógica no Main (Domain Services).
6. **Stack fixa.** Divergir só com ADR em `docs/ADR/` + justificativa no HANDOFF.
7. **Arte/ícones/logos: nunca vermelho, nunca vermelho+amarelo.** Perguntar por paleta alternativa.

<!-- kit-orquestrador:inicio -->
Papéis: o **chefe técnico** (Claude Code) planeja, escreve as ordens de serviço, audita e decide; o **executor** (Antigravity `agy`
ou outra IA) implementa. O dono do produto autoriza merge e `git push` (ao fim de fase aprovada o chefe os faz, ver seção Git). Nenhuma IA aprova o próprio trabalho.
Antes de qualquer trabalho leia: este arquivo, `docs/FASES.md`, `docs/PROTOCOLO.md`, `docs/HANDOFF.md` e `docs/ADR/` (se existir).

## Disciplina de verificação
- Nada é "concluído" sem evidência colada no HANDOFF (saída real de comando). Feature com UI só conta se foi aberta e usada de verdade.
- Nunca declare "não existe/não está instalado" sem busca exaustiva citando o comando.
- Não copie afirmação técnica de documento anterior sem reler o código atual.
- Mesmo sintoma duas vezes = pare e ache a causa raiz; não empilhe contornos.
- Pipeline/CI só é "pronto" depois de rodar de verdade.

## Git
- Uma fase = uma branch `fase/NN-slug`. Commits pequenos, mensagem no imperativo. Não commite em `main` durante uma fase.
- **Nunca `git push` nem merge sem ordem explícita do dono, naquele momento.** EXCEÇÃO PERMANENTE (ordem do Alexandre, 2026-10-03): ao FIM de cada fase/spec, depois do veredito APROVADA do chefe (Claude Code) e de `npm run verify`/`node tools/auditar.cjs` verdes, o chefe pode commitar, fazer o merge `--no-ff` da branch da fase em `main`, criar a tag da principal (padrão `tag_<versão publicada>_<palavra-chave de segurança>`) e fazer `git push` de `main` e da tag, sem pedir confirmação. Só o chefe: a AGY e qualquer outro executor continuam proibidos de push e merge. Nunca `--force`. Fora do fim de fase aprovada, a regra geral abaixo continua valendo.
- Ao terminar: atualize `docs/HANDOFF.md`, commite e pare.

## Autoauditoria obrigatória (executor) — antes de declarar a fase pronta
Você é auditado por outra IA que **reexecuta tudo** e por ferramentas automáticas (`tools/auditar.cjs`). Antecipe-se:
1. **Clone limpo:** clone sua branch fora do projeto, rode a instalação e o `verify` lá; cole a saída real.
2. **Gate único:** o comando de verificação do projeto (`verifyCmd` em `orquestrador.config.json`) deve passar. Se a fase muda a UI, estenda a sonda para exercitar a tela nova.
3. **Ataque a própria entrega:** para cada regra da ordem de serviço, escreva pelo menos um teste que tente **violá-la** (entrada inválida, nula, gigante, repetição, ordem trocada, caminho malicioso, **queda no meio do fluxo**). Teste só de caminho feliz não conta.
4. **Cheque o artefato final:** o que vale em desenvolvimento pode não valer no build/empacotado. Teste o que será entregue.
5. **Revise seu diff** procurando: variável calculada e não usada, retorno que ignora falha, regra só documentada e não testada, afirmação que você não executou.
6. Escreva `docs/reviews/autoauditoria-NN.md`: cada critério → comando → saída real → PASS/FAIL, e a lista do que **NÃO foi verificado**. Sem evidência = FAIL.
7. Só então atualize o HANDOFF, commite e pare.

### Prova prometida = prova entregue, não uma mais fraca (checado por máquina)
Quando uma ordem de serviço pede prova visual/pixel (palavras como "pixel", "amostragem", "captura de tela"), a
autoauditoria PRECISA conter, perto do mesmo item (ID do cabeçalho, ex. `H3`, `C1`, `RT4`), uma evidência real de
pixel (contagem de pixels, `getImageData`, captura de tela) — não uma checagem mais fácil e mais fraca (ex.: "a
propriedade do objeto está configurada certo") apresentada como se cumprisse o pedido. `node tools/checar-provas.cjs
--root .` roda isso automaticamente e agora faz parte de `tools/auditar.cjs`: reprova mesmo que a linha da
autoauditoria diga PASS. Isso existe porque já aconteceu (Fase 07, borracha de trecho): pixel prometido, propriedade
entregue, PASS marcado. Regra geral: nunca troque o método de prova pedido por um mais barato sem avisar
explicitamente no relatório que a prova pedida NÃO foi feita.

### Regras de ouro contra invenção (aprendidas na prática)
- **Não invente.** Todo evento, arquivo, função, branch, script ou comando que você citar na documentação precisa existir no código. `tools/verificar-afirmacoes.cjs` confere e reprova. Não prometa "será implementado na fase X" o que o plano não prevê.
- **Divergência do plano = ADR.** Se você acrescentou/removeu algo em relação à ordem de serviço, registre em `docs/ADR/` e no HANDOFF. "Nenhuma divergência" só se for verdade.
- **Segredos:** compare token/segredo/MAC com tempo constante (`timingSafeEqual` ou equivalente); nunca registre segredo em log; gere com CSPRNG.
- **Estado parcial:** falha no meio de um fluxo (queda de conexão, exceção) não pode deixar o sistema travado nem consumir um recurso de uso único sem concluir.
- **Toda regra de limite (rate limit, timeout, tamanho, TTL) tem teste que tenta estourá-la.**
- **Execução:** seu processo termina quando você para de chamar ferramentas. Nunca escreva "aguardando" com uma tarefa em segundo plano: continue esperando com ferramentas na mesma execução.
<!-- kit-orquestrador:fim -->

## Lições específicas do projeto
As lições aprendidas (erros reais, contornos, invenções e falsos positivos de testes) foram consolidadas e movidas para o catálogo principal. Leia `docs/LICOES.md`. Mantenha apenas a ressalva operacional:
- O VS Code define `ELECTRON_RUN_AS_NODE`; ao lançar Electron por script, apague essa variável do ambiente.
