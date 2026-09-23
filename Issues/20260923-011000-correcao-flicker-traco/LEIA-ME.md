# Issues - correção do flicker de remoção/readição do traço (2026-09-23)

- `ordem-correcao.md`: D3, ÚNICO objetivo — eliminar a janela em que o canvas fica sem o traço recém
  desenhado entre `this.canvas.remove(pathObj)` (`engine.ts:475`) e a reinserção via `renderState`.
- Causa-raiz **confirmada por investigação** (não é mais suposição): `docs/reviews/investigacao-mouseup.md`
  (rodada de investigação, `Issues/20260923-005500-investigacao-mouseup`) rastreou o código linha a linha e
  mediu empiricamente a janela onde `this._objects` fica com o traço recém-solto ausente, entre a remoção
  síncrona em `path:created` e a reinserção assíncrona (via `useEffect` do React) em `renderState`. É isso
  que o dono via como "apaga ao soltar" / "parece colar em cima em vez de escrever" — confirmado como um
  fato arquitetural real, não boato.
- Esta é a 6ª rodada sobre este sintoma, mas a PRIMEIRA com causa raiz confirmada por evidência (não
  adivinhação). Não repita as 5 tentativas anteriores de "corrigir sem provar" — a ordem abaixo exige prova
  de que a janela de "canvas vazio" deixou de existir, não só que o teste de pixel de sempre continua
  passando (aquele teste, como já documentado em `docs/reviews/diagnostico-sync-3.md`, nunca foi sensível a
  este bug específico).
