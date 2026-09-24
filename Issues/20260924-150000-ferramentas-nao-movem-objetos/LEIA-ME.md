# Issues - ferramentas de desenho não podem mover objetos existentes (2026-09-24)

- Relato do dono (Host apenas, Guest fica para depois): com retângulo, elipse, linha, seta ou texto, ao
  desenhar algo NOVO por cima de um objeto anterior, o app ARRASTA o objeto anterior em vez de só desenhar.
  Na mão livre isso não acontece ("parece que está pintando a superfície"). Exigência: as ferramentas de
  desenho têm que se comportar como a mão livre.
- Diagnóstico (lido no código, não suposição): `WhiteboardEngine.setTool` (`src/shared/canvas/engine.ts`)
  só faz `canvas.selection = false` nas ferramentas de forma/texto. Os objetos existentes seguem
  `selectable: true` (`createFabricObjectFromData`) e sensíveis ao mouse; o mousedown sobre um deles faz o
  Fabric selecionar e arrastar, enquanto `startShapeCreation` cria a forma nova. Na mão livre
  (`isDrawingMode = true`) o Fabric não procura objetos sob o cursor, por isso ali não ocorre.
- Achado adicional: NÃO existe evento de mover no modelo (`grep object:modified|DRAW_UPDATE|DRAW_MOVE` sem
  resultados). Um arrasto é mutação local que não persiste nem sincroniza com o Guest, e a próxima
  reconstrução do quadro o desfaz. Isso é decisão de produto (ver ordem-correcao.md, D12.3).
- Lição aplicada: a prova é captura de TELA real (`page.screenshot`) + SendInput real, conforme AGENTS.md
  (postmortem `docs/reviews/postmortem-desenho-some.md`).
