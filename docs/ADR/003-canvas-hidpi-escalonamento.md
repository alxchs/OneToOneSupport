# ADR-003: Compensação HiDPI e Prevenção de Dupla Escala no Canvas

## Contexto
O Host opera em monitores de altíssima resolução (3840 x 2160) com fator de escala de exibição de 150% (`devicePixelRatio = 1.5`). Em versões antigas de canvas, a compensação de DPI exigia manipulação manual de dimensões físicas e CSS. O Fabric.js 6.x já implementa internamente o gerenciamento de retina scaling (`enableRetinaScaling: true` por padrão). Se um ajuste manual de escala for aplicado simultaneamente ao gerenciador interno do Fabric, ocorre o problema de "dupla escala" (deslocamento dos cliques e traços fora da ponta do cursor).

## Decisão
- A janela principal do Electron consulta dinamicamente o `scaleFactor` do monitor primário (`screen.getPrimaryDisplay().scaleFactor`) para dimensionamento fluido da interface com unidades relativas.
- No Fabric.js 6.x, o canvas aproveita o retina scaling nativo da biblioteca ou aplica `canvas.setDimensions({ width, height }, { cssOnly: true })` de maneira coordenada, garantindo que o fator de escala não seja aplicado em duplicidade.
- A exatidão do mapeamento de coordenadas (ponto de clique = ponto desenhado) deve ser validada por testes automatizados sob `devicePixelRatio` 1.0 e 1.5.

## Consequências
- Renderização perfeitamente nítida em monitores 4K @150% sem serrilhado ou borrões.
- Coordenadas de desenho e clique perfeitamente alinhadas, tanto no desktop Host quanto no dispositivo móvel Guest.
