# Experimento: o executor consegue se auditar no padrão do chefe?

Hipótese (sugestão do Alexandre, 2026-09-19): ensinando o Antigravity a auditar a própria entrega, o chefe gasta menos tokens e acha menos defeitos.
Método: a partir da fase 02, o executor entrega junto o `docs/reviews/autoauditoria-NN.md`. O chefe audita **de forma independente** e compara.

## Métricas por fase
- **D_chefe:** defeitos que o chefe achou e o executor não tinha achado (o que importa).
- **D_auto:** defeitos que a autoauditoria do executor já tinha achado e corrigido.
- **Falsos PASS:** itens que a autoauditoria marcou PASS e o chefe reprovou (mede honestidade/assertividade).
- **Custo do chefe:** o que foi preciso rodar/ler para fechar (qualitativo: "só reexecutar o verify" vs "ler o diff inteiro").

| Fase | D_chefe | D_auto | Falsos PASS | Custo do chefe | Observações |
| --- | --- | --- | --- | --- | --- |
| 01 (baseline, sem autoauditoria) | 2 (CSP em file://, `info.changes` ignorado) | n/a | n/a | alto: leitura de código + clone limpo + sonda manual | HANDOFF afirmava "CSP ajustada"; era falso em produção |
| 02 | 0 achados (auditoria por amostra) | autoauditoria verde, 13/13 sonda | 0 | baixo: auditor automático + leitura de trechos | dev CSP tratada como pedido |
| 03 | 3 (HANDOFF cita eventos inexistentes; "Opus" inventado; branch/divergência erradas) | autoauditoria só após 1ª reprovação do auditor | 1 (HANDOFF/autoauditoria afirmam algo que o código não tem) | baixo | executor **inventa escopo** e omite passos; auditor pega omissões, não invenções |
| 04 | 3 ressalvas de segurança/teste (timingSafeEqual, token queimado antes do handshake, rate limit sem teste) + 1 invenção repetida | 28 PASS / 0 FAIL, mas nenhuma das 3 ressalvas | 1 (evento inexistente citado de novo) | baixo: 4 leituras de trechos | testes de ataque presentes e coerentes; faltou atacar a própria lógica de token |

## Critério de decisão
Se por 2 fases seguidas `D_chefe == 0` e `Falsos PASS == 0`, o chefe reduz a auditoria a: reexecutar `npm run verify` em clone limpo, conferir `autoauditoria-NN.md` por amostragem e abrir a tela. Caso contrário, mantém a auditoria completa e endurece o `AGENTS.md`.
Delegação: tudo que for seguro e auditável vai para o executor; o chefe mantém decisões de arquitetura, ADRs, veredito, merge e qualquer ação irreversível.

## Regime "QA desconfiado" (vigente até o Alexandre declarar confiança)
Enquanto não houver 2 fases seguidas com `D_chefe == 0` e `Falsos PASS == 0`, o chefe trata toda afirmação do executor como não verificada:
1. Roda `node tools/auditar.cjs` (clone limpo + `npm ci` + `verify` + sonda + checagens estáticas). Lê **só o resumo** (~15 linhas).
2. Abre a tela de verdade e tenta quebrar 2-3 regras por conta própria (o que o auditor não cobre).
3. Lê por amostra os trechos de maior risco do diff (segurança, SQL, IPC), não o diff inteiro.
4. Compara com `autoauditoria-NN.md`: todo PASS dele que o chefe reprova vira "Falso PASS" na tabela.
Ao ganhar confiança o regime relaxa: passo 1 sempre; passos 2-4 por amostragem. Reversível: um Falso PASS volta ao regime completo.

## Cobertura cruzada (uma IA cobre as lacunas da outra)
- **Executor -> chefe:** o Antigravity revisa em modo somente-leitura (`agy --mode plan`) os artefatos escritos pelo chefe (ordens de serviço, ADRs, `auditar.cjs`, `probe-runtime.cjs`) procurando lacunas, ambiguidades e testes ausentes. Achados vão para `docs/reviews/revisao-cruzada-NN.md`.
- **Chefe -> executor:** auditoria independente de cada fase (acima).
- Regra: nenhuma IA aprova o próprio trabalho. Quem escreveu não é quem valida.

## Controle de custo (tokens do chefe)
Limite honesto: o chefe **não enxerga o próprio consumo de tokens**; quem vê é o Alexandre (`/cost` ou `/usage` no Claude Code). Para saber se estamos economizando:
1. Antes de despachar a fase: anotar o custo acumulado da sessão do Claude Code.
2. Depois da auditoria da fase: anotar de novo. A diferença é o **custo de auditoria da fase**.
3. Comparação de referência: o custo da fase 01, quando o chefe leu código e logs à mão, e uma estimativa do que seria o chefe implementar a fase inteira.

| Fase | Custo do chefe: preparar ordem | Custo do chefe: auditar | Total | Observação |
| --- | --- | --- | --- | --- |
| 01 | não medido | não medido | não medido | baseline sem medição; auditoria feita com leitura manual de código e logs |
| 02 | _preencher_ | _preencher_ (`auditar.cjs` + tela + amostra) | _preencher_ | 1º uso do auditor |

Alavancas já aplicadas para gastar menos: implementação 100% delegada; auditoria automatizada que devolve resumo curto; gate `npm run verify` que o executor roda sozinho; sonda de runtime reutilizável; regras estáticas (`noUnusedLocals`) no próprio typecheck.
Sinal de alerta: se o custo de auditar de uma fase passar do que custaria implementar, a delegação não está compensando e ajustamos as ordens (mais específicas) ou o gate (mais forte).

## Registro da fase 02, tentativa 1 (falha de despacho)
O `agy` terminou sem produzir nada: iniciou uma busca em segundo plano do repositório e o modo `--print` encerrou antes. Causa provável: a ordem cita `tools/probe-runtime.cjs`. Correção: o despacho agora informa o diretório absoluto, usa `--add-dir`, proíbe tarefas em segundo plano e o script falha se não houver commit novo. Custo: 1 despacho perdido, 0 tokens de auditoria do chefe.

## Medição real (fonte: `/usage` do Alexandre, 2026-09-20 ~02:50, antes da fase 02)
Sessão atual: 2% usado (janela reinicia 07:59). Semana (todos os modelos): 24% usado (reinicia 25/09 13:59).
Diagnóstico do `/usage`: **94% do uso das últimas 24h e 96% dos últimos 7 dias ocorreram com contexto > 150k tokens** e 80% em sessões ativas há 8+ horas. O custo está no tamanho da conversa carregada a cada resposta, não na auditoria em si.
Consequência: a principal alavanca é **uma sessão limpa por fase** guiada por `docs/CHEFE.md` (poucos milhares de tokens de contexto em vez de centenas de milhares). Anotar aqui, a cada fase, `/usage` (semana %) antes do despacho e depois da auditoria; a diferença de pontos percentuais é o custo do chefe naquela fase. Nota: o percentual da semana inclui outras sessões e projetos; comparar só janelas em que este projeto foi o único uso.

| Fase | Semana % antes | Semana % depois | Delta | Sessão limpa? |
| --- | --- | --- | --- | --- |
| 02 a 04 (lote 1) | 24% (antes do despacho) | 26% (depois da auditoria do chefe, 2026-09-20) | +2 pontos | não (mesma sessão longa, contexto > 150k) |
| (parcial) | 24% | 25% (com fases 02 e 03 já entregues, antes da auditoria) | +1 ponto | não |

## Registro do lote 1 (2026-09-20, 1ª execução)
- Fase 02: verde na 1ª tentativa (50 testes, sonda 13/13, 10 commits). Ainda sem auditoria independente do chefe.
- Fase 03: implementação entregue (105 testes, sonda 13/13), mas **omitiu `autoauditoria-03.md`** (o auditor automático pegou). Falha de processo do executor: pulou o passo que o AGENTS.md exigia.
- **Falha repetida (3ª vez):** o `agy` roda comando longo (`npm run verify`) em segundo plano, escreve "aguardando" e o modo `--print` encerra sem commit. Causa raiz tratada: (a) regra crítica no cabeçalho do despacho (não terminar turno esperando; fazer polling), (b) a correção automática agora passa a evidência do auditor e **proíbe** repetir comandos longos, (c) `rodar-lote` audita antes de redespachar fase já entregue.

Leitura do lote 1: 3 fases (~10 mil linhas novas, 121 testes, servidor E2EE, UI com QR) por +2 pontos da semana, incluindo despacho, correções de ferramenta e a auditoria do chefe. Ressalvas: percentuais inteiros (erro de até ~1 ponto), a semana soma outros usos, e a sessão foi longa (contexto grande, o pior caso de custo). Próximo teste: lote 2 em sessão limpa via docs/CHEFE.md, para medir o efeito da sessão curta.

## Registro do lote 2 (2026-09-20, sessão limpa via docs/CHEFE.md)
- Fases 05, 06, 07 entregues (139 → 158 → 172 testes; sonda 14 → 16 → 21). Auditor automático verde nas três; **falsos PASS: 2 defeitos reais da fase 05** (autoridade que falha aberta, path traversal por `abaId`) que só a leitura do chefe achou, e a afirmação falsa sobre `SCREEN_LOCKED`.
- **Red team falhou nas 3 fases**: bug do kit (variável `$modelo` colidindo com parâmetro `$Modelo`). Causa raiz achada e corrigida na 3ª ocorrência do mesmo erro (esperei o lote acabar para não sujar a árvore).
- Lições da fase 04 (timingSafeEqual, token queimado antes do handshake, teste de limites): resolvidas na 05, sem recorrência.
- Custo: semana 27% ao disparar o lote; 27% no início desta sessão (o Alexandre informou). Falta o /usage final.
- Semana 29% após a auditoria da correção do lote 2 (27% → 29%, +2 pontos). **Medição contaminada:** o Alexandre usou o Claude em outros projetos no período, então o delta NÃO é só deste projeto. Falta o valor após o red team.
- Correção C1–C5 (agy): auditor verde (188 testes, sonda 22/22); o chefe reatacou C1 e C2 com vetores próprios (20 de `abaId`, 4 de `sessaoId`, 15 autores × 12 tipos): nenhum vazamento de caminho, autoridade só para `host`/`guest` exatos. C3 e C5 não reabertos pelo chefe.
- Red team (1ª execução real do kit): 40 ataques, 35 defendidos, **5 vulneráveis** (todos em `SessionManager`, fase 04/07), que a auditoria do chefe e o auditor automático tinham dado como corretos. Corrigidos na rodada seguinte (236 testes, sonda 22/22) com fonte única de autoridade (ADR-011). O chefe reatacou: sem vazamentos.
- Padrão recorrente (2 ocorrências): lista de bloqueio com "permitir por padrão" em `EventoService` e em `SessionManager`; tratado na causa raiz (allowlist única compartilhada).
- Erros de processo do chefe: (1) afirmou `canGuestExecute` correto sem checar omissões; (2) commitou durante a execução do red team, que descartou a entrega (recuperada pelo reflog). Do executor: alterou o arquivo de testes do red team (1 linha, benigno) contra a ordem.
- Semana 29% ao fim do lote 2 (correção + red team + reauditoria): sem variação desde a medição de 29% anterior. Total do lote 2 com o chefe em sessão limpa: 27% → 29% (+2 pontos, contaminado por uso em outros projetos; o custo real deste projeto é ≤ 2 pontos).
- Homologação 1 (2026-09-21): o teste físico do dono achou 3 defeitos que 24/24 checagens automáticas não viram. Causa: a sonda conectava por loopback (contexto "seguro"); no IP de LAN em HTTP `crypto.randomUUID` não existe. Lição registrada: verificação de rede precisa usar o IP de LAN (contexto inseguro), e conteúdo, não contagem. O executor diagnosticou bem a causa raiz (melhor entrega do experimento), mas substituiu a checagem de pixels da borracha por checagem de propriedade e marcou PASS.
- Semana 30% após a correção da homologação 1 (29% → 30%, +1; medição contaminada por outros projetos).
