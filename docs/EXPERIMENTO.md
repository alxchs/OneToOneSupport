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
| 02 | 24% | _preencher_ | _preencher_ | _sim/não_ |

## Registro do lote 1 (2026-09-20, 1ª execução)
- Fase 02: verde na 1ª tentativa (50 testes, sonda 13/13, 10 commits). Ainda sem auditoria independente do chefe.
- Fase 03: implementação entregue (105 testes, sonda 13/13), mas **omitiu `autoauditoria-03.md`** (o auditor automático pegou). Falha de processo do executor: pulou o passo que o AGENTS.md exigia.
- **Falha repetida (3ª vez):** o `agy` roda comando longo (`npm run verify`) em segundo plano, escreve "aguardando" e o modo `--print` encerra sem commit. Causa raiz tratada: (a) regra crítica no cabeçalho do despacho (não terminar turno esperando; fazer polling), (b) a correção automática agora passa a evidência do auditor e **proíbe** repetir comandos longos, (c) `rodar-lote` audita antes de redespachar fase já entregue.
