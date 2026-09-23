# Issues - sumiço do desenho, 5ª rodada (2026-09-23)

- `ordem-correcao.md`: D2 (único objetivo) — captura de PNG do canvas do Host amarrada ao mesmo timeline
  de `[DIAG-HOST]`/`[DIAG-SERVER]` já implementado em D1, porque o log de eventos (D1) chegou real desta vez
  e está **saudável** (nada é removido, a contagem de elementos visíveis só cresce) — ou seja, D1 provou que
  o problema NÃO está na camada de eventos/reducer/persistência. O que falta é prova em PIXEL amarrada ao
  mesmo timeline, porque a queixa ("continua apagando ao finalizar", "parece colar em cima em vez de escrever")
  é necessariamente visual e o log de D1 não carrega geometria nem imagem.
- Motivo: esta é a 5ª rodada sobre sumiço/sobreposição de desenho. As 4 anteriores adivinharam sem log real
  (Issues/20260920-*, 20260921-*) ou pararam em D1 sem ainda ter o log real (Issues/20260922-013720). O dono
  colou o log real pedido em D1 nesta rodada — está analisado em `docs/reviews/diagnostico-sync-3.md`.
- Repro automatizado que TENTEI e NÃO reproduziu (evidência negativa real, não invenção): 3 traços de lápis
  bem separados no Host, com espera de 500ms entre eles, mediram pixels por região antes/depois de cada
  traço subsequente — todas as regiões mantiveram os pixels. Isso restringe a hipótese: o bug real do dono
  provavelmente exige traços RÁPIDOS/PRÓXIMOS/SOBREPOSTOS (como escrita cursiva de verdade), cenário que
  meu repro não cobriu e a sonda `tools/probe-runtime.cjs` (V3) também não cobre (ela só mede 1 forma por
  vez, delta global, nunca testa se um traço N+1 apaga visualmente o traço N).
