# Auditoria do chefe — Fase 11: Quadro com sensação de Paint

## Rodada 1 (2026-10-02): REJEITADA

`node tools/auditar.cjs`: TUDO VERDE (434 testes, sonda 48/48, autoauditoria 58 PASS / 0 FAIL). Leitura do diff
de `src/shared/canvas/engine.ts` e um teste de ataque do chefe acharam 2 defeitos reais que nenhum teste da fase
pegava, porque **todos os testes da fase montam a engine com `setDimensions(1200, 800)`, ou seja, escala 1**, o
único caso em que pixel de tela e coordenada de cena coincidem. Os testes da borracha também passam o alvo
pronto (`target: rectObj`), sem exercitar a busca de alvo.

O que está certo: botão Seleção removido e `select` cai em `pencil` (P1); texto continua em `text` (P2); texto
sem alças (P3); rótulos e cursor de borracha (P4); D15 preservado (`setTool` → `syncDragLocks`).

### Defeitos
1. **A Borracha (Traço inteiro) apaga um elemento que não está sob o ponteiro.** `handleEraserAction` ganhou
   uma busca de alvo própria, com 4 heurísticas de caixa envolvente somadas com OU e margem de 12 px. Isso não
   foi pedido e não está declarado na autoauditoria. A heurística 3 compara o ponteiro em **pixels de tela**
   (`clientX - rect.left`) com `getBoundingRect()`, que no Fabric 6.6 responde em **coordenadas de cena**
   (`makeBoundingBoxFromPoints(this.getCoords())`). Com a escala do celular (~0,34), tocar numa área vazia apaga
   um retângulo que está em outro lugar. Prova: `tests/adversarial/borracha-escala.test.ts`, caso
   "celular escala ~0,34": `"dentro": false`, esperado `"hides": 0`, recebido `"hides": 1`.
2. **Exceção a cada clique da borracha em área vazia no Host.** A heurística 4 passa um `{x, y}` simples a
   `containsPoint`, que espera um `Point` do Fabric. Resultado: `TypeError: e.eq is not a function` em
   `Intersection.isPointContained`, lançado dentro do tratador de `mouse:down`
   (`engine.ts:826`). Prova: mesmo arquivo, caso "Host escala 1,5".

### Correções pedidas (ver o despacho da rodada 2)
- Remover a busca de alvo com heurísticas e usar só a do Fabric (`opt.target`, e `canvas.findTarget(e)` se
  for preciso no `mouse:move`). Se em algum caso real o `opt.target` vinha `null`, achar a causa raiz, com
  evidência, em vez de somar heurísticas.
- Paint de verdade: a borracha só apaga o que o ponteiro **toca** (`perPixelTargetFind` + `targetFindTolerance`
  nas borrachas, ou equivalente do Fabric). Tocar no interior vazio de um círculo, ou na área vazia da caixa de
  uma linha diagonal, não apaga.
- Testes em escala diferente de 1 (Host 1,5 e celular ~0,34), e prova na sonda V8 com captura de tela real.

## Rodada 2 (2026-10-02): APROVADA

`04775f3`. A busca de alvo com heurísticas foi removida e a borracha usa só a do Fabric, com
`perPixelTargetFind` e `targetFindTolerance` (4 px × escala) ligados apenas em `eraser`/`object_eraser`.
`tests/adversarial/borracha-escala.test.ts` (do chefe) passou sem ser alterado.

- `node tools/auditar.cjs`: TUDO VERDE, com 459 testes, sonda 49/49 e autoauditoria 73 PASS / 0 FAIL.
- Sonda reexecutada pelo chefe (app real, `page.screenshot`, `SendInput` no Host):
  - **Moldura:** 0 px em todas as ferramentas, no Host e no Guest.
  - **Borracha no Host:** a linha diagonal foi apagada ao tocar o traço (850 → 0 px). O toque nas áreas vazias não apagou nada (linha 850 → 850 px; elipse 1674 → 1674 px).
  - **Borracha no Guest:** mesmo resultado (167 → 0 px; áreas vazias 167 → 167 e 372 → 372 px).
  - **Exceções no renderer:** 0.
- Captura da tela real conferida pelo chefe: a barra não tem Seleção, a ferramenta Texto continua ativa
  depois de confirmar, e formas sobrepostas aparecem sem moldura nem alça.

Ressalvas, sem bloquear a aprovação:
- Os botões "Texto" e "Borracha (Traço inteiro)" ficaram sem ícone, enquanto os outros têm.
- Os 3 avisos `TIPO_SUPRIMIDO` são de código de evento do Fabric.
- Não verificado: celular físico; GIF de comprovação (ainda depende da resposta do dono).
