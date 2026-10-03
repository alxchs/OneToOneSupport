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
3. Executor implementa, **se autoaudita** (seção do `AGENTS.md`: clone limpo, `npm run verify`, ataque à própria entrega, `docs/reviews/autoauditoria-NN.md`), cola as saídas no `docs/HANDOFF.md`, commita e para.
4. Chefe **audita sem confiar no relato**, começando por `node tools/auditar.cjs` (resumo curto), no regime "QA desconfiado" de `docs/EXPERIMENTO.md`, e registra a comparação e o custo lá: checkout, `npm ci`, build, testes, leitura do diff, cada critério de aceite,
   e a checklist de verificação do `AGENTS.md`. Fase com UI: abre o app de verdade.
5. Veredito escrito em `docs/reviews/fase-NN.md`: **APROVADA** ou **REJEITADA + lista de correções numeradas**.
   Rejeitada → chefe emite prompt de correção ao executor (ou corrige pequenas coisas ele mesmo). Repetir 4.
6. Aprovada → chefe pede ao Alexandre o merge `--no-ff` em `main`. Push só com ordem explícita e naquele momento.

## Regras de disciplina para todos os executores
- Uma IA por vez por branch. Quem termina atualiza o HANDOFF antes de trocar.
- "Concluído" exige evidência colada (saída real de comando). Sem evidência = não concluído.
- Divergência da spec = ADR + aviso no HANDOFF, nunca silenciosa.

## Aprendizado da AGY e passagem da gerência (decisão do chefe, 2026-10-02, pedido do Alexandre)
Objetivo: a AGY assumir tarefas complexas e, por fim, a gerência do projeto na ausência do Claude Code. A memória
interna do Antigravity é por conversa e opaca; **o que a AGY aprende mora no repositório**:
- `docs/LICOES.md` — catálogo de lições (cada erro real vira uma entrada com origem, regra e "como atacar").
- `.agents/skills/` — procedimentos que o Antigravity carrega sozinho: auditar, escrever ordem, registrar lição, conduzir o ciclo.
- `tools/auditar.cjs` + `orquestrador.config.json` — o que dá para checar por máquina sai da lição e vira regra.

**Ciclo de aprendizado (obrigatório, para qualquer chefe):** toda rodada rejeitada, defeito achado pelo chefe,
falso PASS ou relato do dono vira uma lição em `docs/LICOES.md` na mesma sessão (skill `registrar-licao`). Se a
lição puder ser checada por máquina, vira regra no auditor; se for de método, entra na checklist da skill.

**Níveis de autonomia da AGY** (o placar fica em `docs/EXPERIMENTO.md`, seção "Placar da AGY como chefe"):
| Nível | A AGY faz | O Claude faz | Para subir |
| --- | --- | --- | --- |
| 0 | executa ordens | escreve ordens, audita, decide | — |
| 1 (atual) | executa; faz **auditoria-sombra** de toda entrega e escreve rascunhos de ordem | revisa a ordem antes do despacho; audita e compara com a sombra | 3 auditorias-sombra seguidas que acham **todos** os defeitos que o Claude achou, sem defeito inventado |
| 2 | conduz o ciclo inteiro (ordem → despacho → auditoria → veredito) | audita por amostragem | 3 ciclos sem defeito escapado (achado depois pelo Claude ou pelo dono) |
| 3 | gerencia sem o Claude | — | — (volta ao nível 1 se um defeito escapar) |

**Independência (vale em todo nível):** quem executou não audita. A auditoria roda em outra conversa e, sempre que
houver cota, em outro grupo de modelo (executor Gemini → auditor `claude-*`, ou o inverso). Auditor e chefe rodam
com `tools/delegar.ps1 -Papel auditor|chefe`, que reprova se mexerem fora dos caminhos permitidos.
**Sempre do dono, em qualquer nível:** merge, `git push`, mudança de escopo/stack, decisões de produto e de paleta.
