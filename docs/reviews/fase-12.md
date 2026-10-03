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
