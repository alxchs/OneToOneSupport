# Protocolo de comando: Claude Code é o chefe técnico

## Hierarquia
- **Alexandre** — dono do produto. Único que autoriza merge em `main` e `git push` (GitHub).
- **Claude Code (chefe técnico)** — decide a ordem das fases, escreve as ordens de serviço (`docs/prompts/`),
  aprova ou rejeita entregas, mantém `docs/HANDOFF.md`, `docs/ADR/` e o `AGENTS.md`. A palavra final técnica é dele.
- **Executores (Google Antigravity é o principal; qualquer IA nova também)** — implementam o que a ordem de serviço manda.
  Não mudam escopo, stack, ordem de fases nem critérios de aceite. Se discordarem, registram em
  `docs/ADR/PROPOSTA-*.md` e **continuam** o que foi ordenado; o chefe decide.

## Onboarding de uma IA nova
Entregar apenas: "Leia `AGENTS.md` e execute `docs/prompts/fase-NN-*.md`." Todo o resto está no repositório.

## Como as ordens chegam ao executor
1. **Automático (preferido):** `tools/despachar.ps1 -Fase NN` roda o **Antigravity CLI** (`~/.gemini/bin/agy.exe`, modo `--print`,
   `--mode accept-edits`) dentro da branch da fase, com o prompt da fase. Log em `docs/execucoes/`.
   Sem `--dangerously-skip-permissions`; se um dia for necessário, exige autorização explícita do Alexandre.
2. **Manual:** Alexandre cola o prompt no Antigravity (IDE).

## Ciclo de cada fase (o chefe conduz)
1. `main` limpa, fase anterior mergeada. `git switch -c fase/NN-slug`.
2. Chefe **refina** a ordem de serviço com o estado real do código (a ordem é escrita para ser autossuficiente).
3. Executor implementa, roda os comandos de verificação da ordem, cola as saídas em `docs/HANDOFF.md`, commita e para.
4. Chefe **audita sem confiar no relato**: checkout, `npm ci`, build, testes, leitura do diff, cada critério de aceite,
   e a checklist de verificação do `AGENTS.md`. Fase com UI: abre o app de verdade.
5. Veredito escrito em `docs/reviews/fase-NN.md`: **APROVADA** ou **REJEITADA + lista de correções numeradas**.
   Rejeitada → chefe emite prompt de correção ao executor (ou corrige pequenas coisas ele mesmo). Repetir 4.
6. Aprovada → chefe pede ao Alexandre o merge `--no-ff` em `main`. Push só com ordem explícita e naquele momento.

## Regras de disciplina para todos os executores
- Uma IA por vez por branch. Quem termina atualiza o HANDOFF antes de trocar.
- "Concluído" exige evidência colada (saída real de comando). Sem evidência = não concluído.
- Divergência da spec = ADR + aviso no HANDOFF, nunca silenciosa.
