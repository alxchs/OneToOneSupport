# Modo ausência — spec para a AGY trabalhar sem o Claude Code (chefe: Claude, 2026-10-03)

Quando o chefe estiver fora, a AGY **não gerencia o produto**: ela consome um backlog fechado, em série, com
auditoria independente e parada automática. Tudo o que ela produz fica **em branch, pendente de revisão**.
Quem lê isto: a AGY (executor, auditor ou orquestrador) e o chefe ao voltar.

## Como roda
`pwsh -NoProfile -File tools\modo-ausencia.ps1 [-Itens B1,B2] [-MaxRodadas 3] [-Autonomo]` (construído na Fase 13).
Por item do backlog, em ordem: branch `fase/NN-slug` **a partir de `main`** (nunca empilhada) → executor
(mesma mecânica do `tools/despachar.ps1`, modelo padrão do projeto) → `node tools/auditar.cjs` → **auditor em outra
conversa** (`tools/delegar.ps1 -Papel auditor`; havendo cota, outro grupo de modelo) → veredito legível por
máquina → rejeitada: nova rodada com os defeitos como `-Extra` (máx. 3) → aprovada ou escalada → próximo item.
Estado de tudo em `docs/FILA.md` (uma linha por item) e logs em `docs/execucoes/`.

## Pode / não pode
| Pode | Nunca (em qualquer circunstância) |
| --- | --- |
| Itens do backlog abaixo e nada além dele | `git push`, merge em `main`, apagar branch/tag, `--force`, `reset --hard` |
| Testes, endurecimento de segurança, medição, documentação, ícones na paleta azul-ardósia | Funcionalidade nova; mudança de escopo, stack ou paleta (ADR é do chefe); vermelho; vermelho+amarelo |
| Corrigir defeito que o próprio item provou, com teste que o reproduz | Alterar `AGENTS.md`, `docs/CHEFE.md`, `docs/PROTOCOLO.md`, `docs/AUSENCIA.md`, `tools/auditar.cjs` |
| Registrar lição (`registrar-licao`) e atualizar `docs/LICOES.md` | Tocar `~/.gemini`, `~/.claude`, credenciais, ou trocar de conta fora da regra de cota |
| Pedir decisão ao dono via `docs/FILA.md` | Declarar "pronto" sem a saída real colada (AGENTS.md) |

## Paradas obrigatórias (o orquestrador para tudo, não só o item)
1. Todos os grupos de modelo com 429 (registrar a menor renovação em `docs/FILA.md`; **não** agendar espera).
2. `npm run verify` vermelho em `main` ou na branch antes de começar o item.
3. O mesmo defeito reaparece depois de uma rodada de correção → item vira `ESCALADO` (a causa raiz é do chefe).
4. Item pede algo da coluna "Nunca", ou a ordem se contradiz com `AGENTS.md`.
5. O auditor não consegue provar um defeito com saída real (defeito sem prova não gera rodada).
6. Três itens `ESCALADO` seguidos.

## Itens `PRONTA-PARA-REVISAO` não são aprovados
A aprovação do auditor da AGY é **provisória**: o chefe, ao voltar, reaudita por amostragem (reataque a 2 regras de
cada item, no regime de `docs/EXPERIMENTO.md`) e só então pede o merge ao dono. O placar "AGY como chefe" em
`docs/EXPERIMENTO.md` ganha uma linha por item; defeito que o chefe achar depois conta como "defeito escapado" e o
nível não sobe.

## Backlog (ordem de prioridade; origem de cada item verificada em 2026-10-03)
| ID | Item | Origem | Aceite mensurável |
| --- | --- | --- | --- |
| B1 | Red team das fases 09 (relatório PDF) e 10 (empacotamento), nunca executado; corrigir o que for vulnerável | `docs/reviews/fase-09-relatorio-pdf.md` ("Não rodei `tools/red-team.ps1`") | `tools/red-team.ps1` rodado de verdade; cada ataque `VULNERÁVEL` com teste que reproduz e correção; `npm run verify` verde |
| B2 | Sessão com 100 abas (relatório e sincronização) | `docs/reviews/fase-09-relatorio-pdf.md` ("Sessão com 100 abas… pendência aceita") | teste/medição com 100 abas: tempo e pico de memória medidos e registrados; gargalo achado vira correção ou lição |
| B3 | Botões "Texto" e "Borracha (Traço inteiro)" sem ícone | `docs/reviews/fase-11.md`, ressalvas | ícones azul-ardósia (`#0284c7`/`#0369a1`/`#0f172a`), prova com `page.screenshot` real no Host e no Guest |
| B4 | Triagem das 24 vulnerabilidades do `npm audit` (2 críticas) | `docs/reviews/fase-01.md`, `fase-07.md`, `fase-09-relatorio-pdf.md` | cada uma classificada (roda no app empacotado ou só dev); só corrige o que não quebra o app (`npm run verify` + sonda no empacotado); o resto vira ADR com justificativa |
| B5 | Medir tamanho real do instalador e do portable vs. a estimativa do ADR-017 | `docs/reviews/fase-09-relatorio-pdf.md` ("tamanho real… a ADR estima, não mede") | tamanhos medidos (`(Get-Item …).Length`) em `docs/reviews/`; ADR-017 corrigido onde a estimativa errou |

**Fora do modo ausência (dependem do dono; não tente):** toque em celular físico (Motorola Edge 70 Pro), clique no
instalador interativo, atualizar as actions do CI (a verificação exige push), GIFs, qualquer funcionalidade nova.
