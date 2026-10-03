# ORDEM DE SERVIÇO — FASE 12: a AGY aprende com o próprio histórico
Branch: `fase/12-aprendizado-agy` (confirme com `git branch --show-current`; se não estiver nela, pare). Você é executor; o chefe técnico é o Claude Code.
Leia: `AGENTS.md`, `docs/PROTOCOLO.md` (seção "Aprendizado da AGY e passagem da gerência"), `docs/CHEFE.md`, `docs/FASES.md`.

## Por que esta fase existe
O dono quer que a AGY assuma tarefas complexas e, depois, a **gerência** do projeto quando o Claude Code não
estiver. Hoje o que o projeto aprendeu está espalhado em vereditos, postmortems e no AGENTS.md, e a sua memória
entre conversas não guarda isso. Nesta fase você transforma o histórico em material que **você mesma** vai
carregar nas próximas conversas. Nenhuma linha de código do produto muda.

## Entregas

### E1. `docs/LICOES.md` — catálogo de lições
Leia **as fontes primárias**, não resumos: `docs/reviews/fase-*.md` (vereditos do chefe, principalmente rodadas
REJEITADAS e "falso PASS"), `docs/EXPERIMENTO.md`, `docs/reviews/postmortem-desenho-some.md`,
`docs/reviews/homologacao-1.md`, `docs/reviews/redteam-*.md`, `docs/reviews/investigacao-*.md` e a seção
"Lições específicas do projeto" do `AGENTS.md`.
Cada lição, no formato exato:
```
## L-NN — <título curto>
- Origem: <arquivo>, <seção ou trecho citável> (e commit, se a fonte citar)
- O que aconteceu: <1-2 linhas, fatos>
- Por que passou: <qual verificação deu PASS falso, ou por que ninguém viu>
- Regra: <imperativo, uma frase>
- Como atacar: <a pergunta ou o teste que o auditor faz para pegar isso numa entrega nova>
- Checagem por máquina: <ferramenta/regra que já checa> | não (motivo)
```
- Agrupe por tema (Prova e evidência · UI, canvas e visual · Rede, Guest e celular · Segurança · Processo e
  ferramentas · Como escrever uma ordem). No topo, um índice com uma linha por lição.
- Uma lição por padrão de falha: se três episódios são o mesmo padrão (ex.: "a prova cobre o caminho que a IA
  controla e ignora o outro lado"), é UMA lição com as três origens.
- Lição só entra com origem real. Não invente episódio, número ou commit; o chefe vai conferir cada origem.
- Inclua obrigatoriamente os erros do próprio chefe registrados nas fontes (ex.: teste negativo sem controle
  positivo, commit durante o red team) — gerência também erra, e é isso que você vai assumir.

### E2. Skills do Antigravity em `.agents/skills/` (formato: `<nome>/SKILL.md` com frontmatter `name` e `description`)
Leia antes `~/.gemini/antigravity-cli/builtin/skills/agy-customizations/docs/skills.md` para o formato exato.
1. `auditar-entrega` — o método do chefe para auditar a entrega de outra IA: `node tools/auditar.cjs` primeiro;
   leitura do diff nas áreas de risco; **checklist de ataque montada a partir do "Como atacar" do LICOES.md**
   (referencie os IDs `L-NN`); controle positivo em todo teste negativo; formato do veredito (o de
   `docs/reviews/fase-11.md`: APROVADA/REJEITADA, defeitos numerados com prova, ressalvas, o que não foi verificado).
2. `escrever-ordem-de-servico` — como o chefe escreve uma ordem que o executor não consegue entender errado: parta
   de `docs/prompts/_modelo-fase.md`; requisitos com ID; critério de aceite verificável por comando; **o método de
   prova nomeado** (pixel → `page.screenshot`; ver L-NN correspondentes); "o que já foi resolvido, não refazer";
   decisões já tomadas. Use como exemplos reais `Issues/20261002-114038-quadro-estilo-paint/` e uma ordem de
   correção de rodada (procure em `Issues/`).
3. `registrar-licao` — o que fazer depois de toda rodada rejeitada, defeito achado pelo chefe, falso PASS ou relato
   do dono: nova `L-NN` (ou nova origem numa lição existente, se for o mesmo padrão), decidir se vira regra de
   máquina (`orquestrador.config.json` → `layerRules` ou `riskSignals.extra`) e atualizar a checklist de
   `auditar-entrega`. Diga também quando a lição vale para qualquer projeto (então vai também para
   `~/.gemini/GEMINI.md`, que é global — só proponha o texto, não edite esse arquivo nesta fase).
4. `chefe-tecnico` — conduzir o ciclo quando o Claude Code não estiver (níveis em `docs/PROTOCOLO.md`): pedido do
   dono → pasta em `Issues/` com LEIA-ME e ordem → branch → despacho do executor (`tools/despachar.ps1` ou
   `tools/delegar.ps1`) → auditoria em **outra conversa e, havendo cota, outro grupo de modelo**
   (`tools/delegar.ps1 -Papel auditor`) → veredito → no máximo 3 rodadas de correção, depois escalar ao dono com o
   resumo → HANDOFF → pedir ao dono o merge. Inclua a regra de cota/troca de conta (resuma a seção "AGY" do
   `C:\Users\alxch\.claude\CLAUDE.md`, que vale para você) e a lista do que é **sempre do dono** (PROTOCOLO).
   Cada skill: até ~150 linhas, em português, imperativa, sem repetir o AGENTS.md inteiro (aponte para ele).

### E3. Ligações
- `AGENTS.md`: na abertura, mande ler também `docs/LICOES.md` e diga que os procedimentos de chefe/auditor estão
  em `.agents/skills/`. Mova o conteúdo da seção "Lições específicas do projeto" para o LICOES.md e deixe lá só um
  parágrafo apontando para ele (o AGENTS.md precisa continuar abaixo de 24.000 bytes; hoje tem ~8.700).
- `docs/EXPERIMENTO.md`: crie a seção "Placar da AGY como chefe" com uma tabela vazia de colunas: data, entrega
  auditada, modelo do auditor, defeitos do chefe, achados pela sombra, defeitos inventados, nível.

## Regras desta fase (cada uma o chefe vai tentar violar)
- Toda `Origem` aponta para um arquivo que existe e um trecho que dá para achar com `git grep`.
- Nenhuma lição contradiz a fonte (ex.: dizer que um defeito foi da fase X quando a fonte diz Y).
- As skills citam só ferramentas, scripts e parâmetros que existem (`tools/delegar.ps1` tem `-Ordem -Nome
  -Modelo -Dir -Papel -Permitidos -ExigirCommit -Autonomo -DryRun`; confira lendo o arquivo).
- Não edite código do produto (`src/`, `electron/`, `tests/`), `tools/`, nem `~/.gemini/`.

## Verificação e autoauditoria
Esta fase não muda o produto: **não rode `npm run verify` nem a sonda**. Rode e cole a saída real:
- `node tools/verificar-afirmacoes.cjs --files docs/LICOES.md,.agents/skills/auditar-entrega/SKILL.md,.agents/skills/escrever-ordem-de-servico/SKILL.md,.agents/skills/registrar-licao/SKILL.md,.agents/skills/chefe-tecnico/SKILL.md`
- Um script (PowerShell ou node, só no terminal, não commitado) que para cada `Origem` do LICOES.md confere que o
  arquivo existe; cole a contagem (origens, arquivos que existem, que não existem).
- `(Get-Item AGENTS.md).Length`.
Autoauditoria em `docs/reviews/autoauditoria-12.md` (critério → comando → saída → PASS/FAIL, e o que NÃO foi verificado).

## Aceite (o chefe reexecuta)
- LICOES.md com todas as origens reais; nenhum episódio importante das fontes ficou de fora (o chefe tem a lista).
- 4 skills no formato do Antigravity, carregáveis, sem citar nada inexistente.
- AGENTS.md aponta para LICOES.md e skills, abaixo de 24.000 bytes.

## Não fazer
Não mexer no produto, em `tools/` nem em `~/.gemini/`. Nada de push nem merge. Atualize o HANDOFF (seção curta da
Fase 12 no topo), commite e pare.
