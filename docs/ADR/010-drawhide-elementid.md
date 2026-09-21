# ADR-010: Suporte a elementId no Evento DRAW_HIDE do Reducer

## Contexto
Na especificação original da Fase 05 (Event Sourcing e Snapshots), o evento `DRAW_HIDE` (borracha lógica) recebia a propriedade `targetId` no payload (`payload.targetId`) para indicar o elemento ocultado.
Durante o desenvolvimento do motor de quadro branco Fabric.js na Fase 06 (`WhiteboardEngine`), a interface interna adotou o padrão `elementId` para associar identificadores de elementos gráficos criados e manipulados na tela.
Para permitir interoperabilidade direta entre a emissão de eventos pela engine do Fabric.js e o reducer de sincronização sem transformações intermediárias frágeis, o reducer (`src/shared/events/reducer.ts`) foi estendido na Fase 06 para reconhecer `payload.elementId` além de `payload.targetId` e `payload.id`. Essa extensão não havia sido formalmente documentada em um ADR.

## Decisão
Registrar formalmente que o evento `DRAW_HIDE` aceita de forma polimórfica e retrocompatível:
```typescript
const targetId =
  (payload.targetId as string) ||
  (payload.elementId as string) ||
  (payload.id as string);
```
O campo canônico primário permanece `targetId`, mantendo compatibilidade total com os testes e logs gerados na Fase 05, enquanto `elementId` é plenamente aceito e suportado tanto no Host Electron quanto no Guest Mobile.

## Consequências
- Total compatibilidade e alinhamento entre o reducer de eventos e os eventos emitidos pela engine do Fabric.js.
- Prevenção de regressões ou incompatibilidades entre versões do Host e do Guest.
- Divergência da especificação da Fase 05 devidamente sanada e rastreada na arquitetura do projeto.
