# ADR-012: Borracha de Trecho (Stroke Segment Eraser) no Event Sourcing Append-Only

## Contexto
Na implementação inicial do quadro branco (Fases 05 e 06), a ferramenta de borracha emitia o evento `DRAW_HIDE`, ocultando por completo o objeto gráfico selecionado ou tocado (Mestre linhas 38 e 75).
Na homologação real da Fase 07 conduzida pelo dono do produto em dispositivo físico (Motorola Edge 70 Pro), esse comportamento foi considerado inadequado para a experiência de uso: o usuário deseja apagar apenas a porção/trecho do desenho por onde a borracha passa (por exemplo, a ponta ou uma curva de um traço longo), em vez de fazer sumir o elemento inteiro.
O desafio técnico consiste em suportar o apagamento por trecho sem quebrar o modelo fundamental de **Event Sourcing append-only** e sem introduzir algoritmos pesados de corte booleano de curvas Bezier no reducer.

## Decisão
1. **Borracha Padrão como Evento DRAW_ADD:** A ferramenta de borracha primária (`eraser`) passa a emitir eventos `DRAW_ADD` de elementos do tipo `'eraser_stroke'`. Cada passada da borracha é registrada como um novo elemento vetorial append-only, contendo o caminho percorrido (`path`), coordenadas e espessura configurável (2, 4, 8 ou 16px).
2. **Composição Visual `destination-out`:** No motor gráfico (`WhiteboardEngine` em `src/shared/canvas/engine.ts`), elementos com `tipo === 'eraser_stroke'` são instanciados como objetos Fabric com `globalCompositeOperation = 'destination-out'`. O buffer do canvas é desenhado sobre fundo branco do container/elemento HTML, de modo que os pixels sob a borracha retornem a transparentes sem expor o fundo escuro da aplicação.
3. **Imutabilidade e Reversibilidade (UNDO/REDO):** Nenhum evento anterior é alterado ou removido fisicamente. Como o apagamento é um `DRAW_ADD`, uma ação de `UNDO` pelo autor oculta o elemento `'eraser_stroke'`, restaurando instantaneamente o trecho apagado. `REDO` reaplica o apagamento.
4. **Determinismo, Snapshots e Replay:** Reconstruir o estado da aba a partir do log de eventos do zero ou a partir de snapshots produz pixels idênticos ao canvas em tempo real. O reducer (`reduceEvent`) mantém complexidade estritamente linear $O(N)$.
5. **Preservação da Borracha de Objeto:** A ferramenta de ocultamento de objeto completo é mantida sob o identificador `'object_eraser'`, emitindo o evento `DRAW_HIDE` original quando o usuário optar por ocultar um elemento inteiro por clique/toque.
6. **Exportação HiDPI (PNG):** O método `toDataURL` compõe o buffer vetorial sobre uma base branca opaca antes da serialização, garantindo que o arquivo PNG exportado não contenha perfurações transparentes.

## Consequências
- Atendimento integral da preferência de usabilidade do dono do produto.
- Preservação total da integridade do log append-only e do modelo CQRS / Event Sourcing.
- Suporte bidirecional transparente: tanto Host quanto Guest sincronizam traços e apagamentos com paridade visual absoluta.
- Mantido benchmark de desempenho com 50.000 eventos processados em menos de 1500 ms.
