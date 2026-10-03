# Auditoria do chefe — Fase 12: a AGY aprende com o próprio histórico

## Rodada 1 (2026-10-02, `ed14195`): REJEITADA

A entrega levou ~5 minutos e foi escrita, na maior parte, a partir do resumo que já estava no `AGENTS.md`, não das
fontes primárias que a ordem mandou ler. O chefe escreveu um gabarito de 21 padrões **antes** de abrir a entrega;
o `LICOES.md` cobre 9.

### Defeitos
1. **Cobertura: faltam padrões que as fontes registram como os mais caros do projeto.** Nenhuma lição para:
   - path traversal por identificador virando caminho de disco — **4 ocorrências da mesma classe**
     (`docs/reviews/fase-05.md` defeito 2 `abaId`; `fase-07.md` defeito 1; `docs/EXPERIMENTO.md` linhas da fase 08
     `sessaoId` e fase 09 `handleRelatorioAbrir`);
   - "a prova cobre o caminho que a IA controla e ignora o outro lado" — a ordem deu esse **exemplo literal** e ele
     não entrou (`docs/EXPERIMENTO.md`, "Registro da Fase 08": homologação 1, fase 07, D16/D17);
   - teste negativo sem controle positivo (erro do próprio chefe, `docs/EXPERIMENTO.md`, "Lição de método desta auditoria");
   - loopback = contexto seguro, IP de LAN não (`docs/reviews/homologacao-1.md` H2, `crypto.randomUUID`);
   - token: comparação sem tempo constante, token queimado antes do handshake, rate limit sem teste (`fase-04.md` 1-3);
   - retorno de falha ignorado (`fase-07.md` defeito 2, `gravarEvento`) — junte com `info.changes`;
   - evidência feita à mão/elevada apresentada como prova da instalação padrão (`fase-10.md` defeito 1, `perMachine`);
   - documento afirmando homologação que não houve (`fase-10.md`, README Safari/Edge/Brave);
   - código não pedido e não declarado (`fase-11.md` rodada 1: as 4 heurísticas da borracha);
   - erros do chefe: `canGuestExecute` afirmado correto sem checar omissões, commit durante o red team (`fase-07.md` linhas 14 e 18);
   - executor alterou arquivo que a ordem proibia (`fase-07.md`, "Desvio do executor");
   - agy encerrando com tarefa em segundo plano (`tools/_comum.ps1`, `New-Cabecalho`; commit `fa89a7e`);
   - armadilhas de ambiente: `ELECTRON_RUN_AS_NODE`, `NODE_ENV=production` pula devDependencies, `MSYS_NO_PATHCONV` (`docs/CHEFE.md`, "Fatos que custaram caro").
2. **Lições perdidas na mudança do AGENTS.md.** O texto removido tinha regras que não foram para o LICOES.md:
   "um diagnóstico que exclui o suspeito não descarta o suspeito" (D8 ignorava o `upper-canvas`); "estilo aplicado
   antes de a biblioteca envolver o elemento é clonado para os elementos que ela cria"; "log limpo do dono não prova
   ausência de bug". Mover sem perder nada era requisito implícito de "mova o conteúdo".
3. **Lições que contradizem a fonte.**
   - L-07: a causa foi a CSP aplicada por header (`onHeadersReceived`), que não vale em `file://`; não "regras que
     rodavam só no Node via `typeof require`" (`typeof require` foi o único teste feito, não a causa).
   - L-06: a denylist estava **no Host** (`SessionManager.canGuestExecute`, `EventoService`), não "no cliente"; e a
     origem `homologacao-1.md` não trata disso. A correção foi a fonte única de autoridade (ADR-011).
   - L-09: a fonte (`fase-10.md` defeito 2) não diz que foi o chefe nem `git revert`. Não atribua autoria nem
     mecanismo que a fonte não traz.
4. **"Checagem por máquina: sim" falso em L-03, L-04, L-05, L-06, L-09.** Um script de evidência dentro de `Issues/`,
   "ataques do red team" ou "escala emulada em UI tests" não são checagem automática que roda em toda entrega. Só é
   "sim" o que roda em `tools/auditar.cjs` (ou no `npm run verify`) e reprova sozinho. O resto é "não (motivo)", e
   esse "não" é exatamente o candidato a virar regra de máquina.
5. **"Controle positivo" definido errado na skill `auditar-entrega` (Passo 3).** Controle positivo NÃO é "um teste de
   caminho feliz garantindo que a base não quebrou". É provar, **no mesmo run**, que o ataque **aconteceu de verdade**
   (ex.: na fase 08, o chefe só pôde dizer "a trava resistiu" depois de provar que o Guest de fato desenhou —
   elementos e eventos subindo no SQLite). Sem isso, "não vazou" não distingue defesa de ataque inerte.
6. **`chefe-tecnico` resume errado a regra de cota.** Diante de um 429, a ordem é: (a) redisparar a mesma tarefa com
   um modelo de **outro grupo** na conta ativa; (b) só se esse grupo também estourar, `trocarConta <nome>`, depois
   de registrar em `~/.gemini/accounts/esgotada.txt` e conferir se outra janela já trocou. Não existe "Skills de Cota".
7. **Formato:** a ordem pediu `## L-NN — título`; veio `### L-NN`. Ferramenta e chefe procuram pelo formato pedido.
8. **"Como atacar" que não ataca a lição** (L-01 pergunta de `display: none`; L-07 "testes falhariam se executados
   a partir de binário recém exportado do diretório de lib?"). O "como atacar" é a pergunta que, numa entrega nova,
   pegaria **o mesmo padrão** — ex. L-01: "a autoauditoria marca PASS num item que pede pixel; a evidência ao lado é
   contagem de pixel de captura de tela ou só uma propriedade?".

### Para a rodada 2
Corrija 1-8 lendo as fontes primárias citadas acima. Depois, **use a sua própria skill `registrar-licao`** para
registrar esta rejeição como lição de processo (resumir de fonte secundária, cobertura não conferida, "sim" de
máquina sem a máquina) — é o primeiro uso real da skill e o chefe vai conferir se ela funciona.

## Rodada 2 (2026-10-02, `f6fd6cb`): REJEITADA

Melhorou de verdade: 22 lições, cobertura do gabarito quase completa, "controle positivo" agora definido certo
(L-03 e skill `auditar-entrega`), regra de cota certa no `chefe-tecnico`, e a skill `registrar-licao` foi usada
(L-22). Mas:

1. **O defeito 4 da rodada 1 voltou.** "Checagem por máquina: sim" continua em L-05 (sonda), L-10 ("ataques
   RedTeam"), L-11 (`npm run package`), L-15 ("`git` recusa merges concorrentes" — falso: o git não sabe que um
   agente está rodando) e L-20 (`verificar-afirmacoes.cjs` não detecta texto **apagado**). A própria L-22, escrita
   nesta rodada, diz que isso é proibido. **Mesmo defeito duas vezes = causa raiz**: instrução em texto não segura
   essa regra; ela vira checagem de máquina (ordem abaixo).
2. **L-10 se contradiz:** título e "Por que passou" falam em controle "no cliente"/"cliente-side", e o "O que
   aconteceu" diz que a denylist estava no Host. A fonte (`fase-07.md` linha 14, ADR-011) diz Host.
3. **L-20 continua inventando:** "commit do chefe de gerência", "diff reverso", "merges estáticos sujos". A fonte
   (`fase-10.md` defeito 2) diz só que `79d679b` apagou as entregas por engano. Escreva só o que a fonte diz.
4. **L-11 junta dois padrões diferentes** (CSP só no artefato final; identificador virando caminho de disco). Uma
   lição = um padrão; o "Como atacar" dela só ataca o segundo.

## Ordem da rodada 3
A. **`tools/checar-licoes.cjs`** (node puro, sem dependência nova), uso `node tools/checar-licoes.cjs [--root dir] [--json]`,
   sai com código 1 se houver qualquer falha, e reprova:
   - título fora do formato `## L-NN — <título>`, número repetido ou fora de sequência;
   - lição sem algum dos 6 campos (`Origem`, `O que aconteceu`, `Por que passou`, `Regra`, `Como atacar`, `Checagem por máquina`);
   - caminho entre crases em `Origem` que pareça arquivo (tem `/` ou extensão) e não exista no repositório;
   - `Checagem por máquina: sim (...)` que não cite, entre crases, um arquivo `tools/...` que **exista** e cujo
     nome apareça em `tools/auditar.cjs` (ou seja, que rode em toda auditoria). Qualquer outro "sim" reprova.
   Integre ao `tools/auditar.cjs` do mesmo jeito que o `checar-provas.cjs` (linha ~73): uma linha no resumo e
   reprovação do auditor se falhar, só quando `docs/LICOES.md` existir.
   Testes em `tests/checar-licoes.test.ts` que tentam **violar** cada regra acima (um arquivo de lições
   temporário por caso) **e** um caso válido que passa (controle positivo).
B. Corrija os defeitos 1-4 desta rodada. Depois de A, `node tools/checar-licoes.cjs` tem que passar no LICOES.md real.
C. **Registre (skill `registrar-licao`) as lições da sua prova de chefe**: leia
   `docs/reviews/prova-chefe-11/RESULTADO.md` (você auditou a Fase 11 às cegas: 0 de 2 defeitos reais, 1 inventado).
   São 4 erros; cada um vira lição nova ou nova origem de uma existente (ex.: o item 2 é mais uma origem da L-07).
   Atualize a checklist da skill `auditar-entrega` com eles: defeito só com a saída real do teste colada; ataque
   nunca com alvo injetado nem só escala 1; código não pedido é o primeiro lugar a ler; papel somente-leitura não
   edita produto nem "para espionar".
D. Acrescente à L-22 a origem desta rodada: o defeito voltou depois de correção explícita e só a máquina segurou.

Verificação: `npx vitest run tests/checar-licoes.test.ts`, `node tools/checar-licoes.cjs`, e `node tools/auditar.cjs`
(desta vez sim, porque `tools/auditar.cjs` muda). Cole as saídas reais (resumidas) na autoauditoria, seção "Rodada 3".
