# AGENTS.md — regras para qualquer IA neste repositório (Antigravity, Claude Code, etc.)

Fonte de verdade: `docs/DOCUMENTO_MESTRE.md`. Plano: `docs/FASES.md`. Fluxo: `docs/PROTOCOLO.md`.
Antes de qualquer trabalho leia os três, mais `docs/HANDOFF.md` (estado atual) e `docs/ADR/`.

## Regras inegociáveis (resumo — o texto completo está no Documento Mestre)
1. **Duplicidade SQLite:** todo INSERT/UPDATE em `ConfiguracaoGlobal` e `Atendidos` passa por `WHERE NOT EXISTS`
   comparando TODAS as colunas de negócio (exceto PK e timestamps). Colunas anuláveis comparam com `IS`, nunca `=`.
2. **Host 3840x2160 @150%:** canvas/Fabric.js sempre leem `window.devicePixelRatio`.
3. **Guest:** homologação mental = Motorola Edge 70 Pro, Android 16, sistema em inglês. Mobile-first, touch events.
4. **Git:** Git Bash 2.52, remoto AWS CodeCommit. **Nunca `git push` sem confirmação explícita do Alexandre naquele momento.**
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
