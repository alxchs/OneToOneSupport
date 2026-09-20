# AGENTS.md — regras para qualquer IA neste repositório (Antigravity, Claude Code, etc.)

Fonte de verdade: `docs/DOCUMENTO_MESTRE.md`. Plano: `docs/FASES.md`. Fluxo: `docs/PROTOCOLO.md`.
Antes de qualquer trabalho leia os três, mais `docs/HANDOFF.md` (estado atual) e `docs/ADR/`.

## Regras inegociáveis (resumo — o texto completo está no Documento Mestre)
1. **Duplicidade SQLite:** todo INSERT/UPDATE em `ConfiguracaoGlobal` e `Atendidos` passa por `WHERE NOT EXISTS`
   comparando TODAS as colunas de negócio (exceto PK e timestamps). Colunas anuláveis comparam com `IS`, nunca `=`.
2. **Host 3840x2160 @150%:** canvas/Fabric.js sempre leem `window.devicePixelRatio`.
3. **Guest:** homologação mental = Motorola Edge 70 Pro, Android 16, sistema em inglês. Mobile-first, touch events.
4. **Git:** Git Bash 2.52, remoto GitHub (ADR-007; o Mestre dizia AWS CodeCommit). **Nunca `git push` sem confirmação explícita do Alexandre naquele momento.**
5. **Sem regra de negócio no Renderer.** Lógica no Main (Domain Services).
6. **Stack fixa.** Divergir só com ADR em `docs/ADR/` + justificativa no HANDOFF.
7. **Arte/ícones/logos: nunca vermelho, nunca vermelho+amarelo.** Perguntar por paleta alternativa.

## Disciplina de verificação
- Nada é "concluído" sem evidência colada no HANDOFF (saída de comando real). Feature com UI só conta se foi aberta e usada de verdade.
- Nunca declarar "não existe/não instalado" sem busca exaustiva citando o comando.
- Não copiar afirmação técnica de doc anterior sem reler o código atual.
- Mesmo sintoma duas vezes = parar e achar causa raiz, não empilhar contorno.
- Pipeline/CI só é "pronto" depois de rodar de verdade.

## Git
- Uma fase = uma branch `fase/NN-slug`, criada a partir de `main` (já com a fase anterior mergeada).
- Commits pequenos, mensagem em português no imperativo. Não commitar em `main` durante uma fase.
- Ao terminar: atualizar `docs/HANDOFF.md` (formato da seção 17 do Mestre), commitar, parar. Quem faz o merge é o Alexandre.

## Autoauditoria obrigatória (executor) — antes de declarar a fase pronta
Você é auditado por outra IA que **reexecuta tudo**. Antecipe-se. Nenhum item abaixo é opcional:
1. **Clone limpo:** `git clone --branch <sua-branch> . ../verificacao-limpa` (fora da pasta do projeto), depois `npm ci && npm run verify` lá. Cole a saída real.
2. **Gate único:** `npm run verify` (typecheck + testes + build + sonda de runtime `tools/probe-runtime.cjs`). Se a fase muda a UI, **estenda a sonda** para exercitar a tela nova (clicar, digitar, ler o resultado). Sonda com FAIL = fase não pronta.
3. **Ataque a própria entrega:** para cada regra da ordem de serviço, escreva pelo menos um teste que tente **violá-la** (payload inválido, valor nulo, repetição, caminho malicioso). Teste que só cobre o caminho feliz não conta.
4. **Cheque as premissas do ambiente:** o que vale em `http://localhost` (dev) pode não valer em `file://` (build). Teste o build empacotado, não só o dev server.
5. **Revise seu próprio diff** (`git diff main...HEAD`) procurando: variável calculada e nunca usada, retorno que ignora falha, regra só documentada e não testada, afirmação no HANDOFF que você não executou.
6. Escreva `docs/reviews/autoauditoria-NN.md`: cada critério de aceite → comando executado → saída real → PASS/FAIL. Liste o que **não** foi verificado. Falta de evidência = FAIL, nunca "provavelmente ok".
7. Só então atualize o HANDOFF, commite e pare.

### Lições já pagas (não repita)
- Fase 01: a CSP por header (`onHeadersReceived`) **não vale em `file://`**; o app empacotado ficou sem CSP e ninguém percebeu porque só o teste de `typeof require` foi feito. Regra geral: validar cada garantia de segurança **no artefato final**, com um teste que tenta quebrá-la.
- Fase 01: função que calcula `info.changes` e não usa; retornar sucesso sem checar o efeito.
- O VS Code define `ELECTRON_RUN_AS_NODE`; ao lançar Electron por script, apague essa variável do ambiente.
