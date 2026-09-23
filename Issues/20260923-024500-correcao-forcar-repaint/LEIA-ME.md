# Issues - correção experimental: forçar repintura real após cada traço (2026-09-23)

- `ordem-correcao.md`: D7, correção EXPERIMENTAL — não é possível provar por automação que resolve (o bug
  nunca reproduziu em 7 tentativas automatizadas diferentes, ver `docs/reviews/investigacao-render-pipeline.md`
  e `docs/reviews/diagnostico-sync-5-repaint.md`). A validação final é o dono testando na própria máquina.
- Evidência que justifica esta direção: `docs/reviews/diagnostico-sync-5-repaint.md` — o dono exportou PNG
  do quadro branco logo depois do desenho "sumir" da tela, e o PNG mostrou os 4 traços perfeitamente. Ou
  seja, o buffer real do canvas (`lowerCanvasEl`) sempre esteve correto; só a janela do Electron/Chromium não
  estava sendo repintada para refletir esse conteúdo na tela. `toDataURL()` (usado pelo botão Exportar PNG)
  aparentemente força um repaint que o fluxo normal de desenho não força.
- Por isso a correção aqui é **forçar esse mesmo tipo de repaint** logo depois de cada traço, sem esperar o
  dono clicar em Exportar.
