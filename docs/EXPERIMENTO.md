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
