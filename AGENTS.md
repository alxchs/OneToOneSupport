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

<!-- kit-orquestrador:inicio -->
Papéis: o **chefe técnico** (Claude Code) planeja, escreve as ordens de serviço, audita e decide; o **executor** (Antigravity `agy`
ou outra IA) implementa. O dono do produto é o único que autoriza merge e `git push`. Nenhuma IA aprova o próprio trabalho.
Antes de qualquer trabalho leia: este arquivo, `docs/FASES.md`, `docs/PROTOCOLO.md`, `docs/HANDOFF.md` e `docs/ADR/` (se existir).

## Disciplina de verificação
- Nada é "concluído" sem evidência colada no HANDOFF (saída real de comando). Feature com UI só conta se foi aberta e usada de verdade.
- Nunca declare "não existe/não está instalado" sem busca exaustiva citando o comando.
- Não copie afirmação técnica de documento anterior sem reler o código atual.
- Mesmo sintoma duas vezes = pare e ache a causa raiz; não empilhe contornos.
- Pipeline/CI só é "pronto" depois de rodar de verdade.

## Git
- Uma fase = uma branch `fase/NN-slug`. Commits pequenos, mensagem no imperativo. Não commite em `main` durante uma fase.
- **Nunca `git push` nem merge sem ordem explícita do dono, naquele momento.**
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

### Regras de ouro contra invenção (aprendidas na prática)
- **Não invente.** Todo evento, arquivo, função, branch, script ou comando que você citar na documentação precisa existir no código. `tools/verificar-afirmacoes.cjs` confere e reprova. Não prometa "será implementado na fase X" o que o plano não prevê.
- **Divergência do plano = ADR.** Se você acrescentou/removeu algo em relação à ordem de serviço, registre em `docs/ADR/` e no HANDOFF. "Nenhuma divergência" só se for verdade.
- **Segredos:** compare token/segredo/MAC com tempo constante (`timingSafeEqual` ou equivalente); nunca registre segredo em log; gere com CSPRNG.
- **Estado parcial:** falha no meio de um fluxo (queda de conexão, exceção) não pode deixar o sistema travado nem consumir um recurso de uso único sem concluir.
- **Toda regra de limite (rate limit, timeout, tamanho, TTL) tem teste que tenta estourá-la.**
- **Execução:** seu processo termina quando você para de chamar ferramentas. Nunca escreva "aguardando" com uma tarefa em segundo plano: continue esperando com ferramentas na mesma execução.
<!-- kit-orquestrador:fim -->

## Lições específicas do projeto (não repita)
- Fase 01: a CSP por header (`onHeadersReceived`) **não vale em `file://`**; o app empacotado ficou sem CSP e ninguém percebeu porque só o teste de `typeof require` foi feito. Regra geral: validar cada garantia de segurança **no artefato final**, com um teste que tenta quebrá-la.
- Fase 01: função que calcula `info.changes` e não usa; retornar sucesso sem checar o efeito.
- O VS Code define `ELECTRON_RUN_AS_NODE`; ao lançar Electron por script, apague essa variável do ambiente.
