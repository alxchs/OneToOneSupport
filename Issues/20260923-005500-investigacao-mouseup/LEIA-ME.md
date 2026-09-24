# Issues - investigação (não correção) do que acontece ao soltar o botão do mouse (2026-09-23)

- `ordem-correcao.md`: pedido do dono, em paralelo ao teste com gravação de tela que ele está fazendo agora
  (ver `docs/reviews/diagnostico-sync-3.md`, rodada 5). É uma ordem de **investigação e documentação**, não
  de correção de código: mapear tudo que roda no `mouse:up`/`path:created` de um traço de lápis, e checar se
  o elemento reconstruído é um "carimbo" colado por cima (imagem rasterizada estática) ou um objeto vetorial
  editável equivalente ao traço original.
- Roda em paralelo a `Issues/20260923-004106` (D2, sonda de traços rápidos + snapshot). Não se sobrepõem:
  esta aqui é leitura de código + explicação escrita; D2 é sonda automatizada.
