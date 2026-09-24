# Post-mortem — "o desenho some ao soltar o mouse" (Fase 07, Homologação 2)

Resolvido em `099787e` (correção) e `31d58dc` (regressão + sonda de tela real). Confirmado pelo dono na
máquina real (Windows 11, GTX 1650, 2560x1440 @150%) em 2026-09-24. Evidência pós-correção:
`docs/reviews/evidencia-pos-correcao-host.png` (traço livre, retângulo, setas, linha e texto, todos na tela).

## Causa raiz
`src/shared/canvas/engine.ts` aplicava `backgroundColor = '#ffffff'` no `<canvas>` ANTES de `new Canvas(...)`.
O Fabric.js cria o `.upper-canvas` copiando o `style.cssText` do elemento original
(`CanvasDOMManager.createUpperCanvas`). A camada de cima ficava branca e opaca e cobria a camada de baixo
(`.lower-canvas`), onde ficam os traços confirmados. Enquanto o mouse estava pressionado o traço aparecia
(o Fabric o desenha na camada de cima); ao soltar, o traço provisório era limpo e sobrava um branco opaco
sobre tudo. Sumiam TODOS os traços, e os dados nunca foram perdidos.

Correção: fundo branco apenas em `lowerCanvasEl`, aplicado depois de criar o Fabric, e `upperCanvasEl`
transparente. O design da borracha de trecho (ADR-012, `destination-out` sobre fundo branco atrás do canvas)
foi preservado.

## Por que levou ~10 rodadas
Todas as provas lidas do lado do canvas estavam corretas, e por isso enganavam: o reducer e os logs (vários logs
reais do dono, todos limpos), o PNG exportado (`toDataURL` lê o canvas de baixo), `getImageData` do canvas de baixo (sonda
V3, repros, D6.1). A sonda deu 27/27 PASS com o bug ativo. Só `page.screenshot` (o que a TELA mostra)
reproduz. O bug também nunca aparecia nos repros porque nenhum deles olhava a tela.

## Hipóteses testadas e descartadas (cada uma com commit ou relatório)
| Hipótese | Resultado |
|---|---|
| Janela de ~2 ms entre remover e recolocar o traço (`investigacao-mouseup.md`) | Refutada pelo GIF do dono: perda permanente, não piscada (`diagnostico-sync-4-gif.md`) |
| Exceção JS silenciosa (D4, `7d213b6`) | Nenhuma exceção em nenhum log |
| `onDprChange` redimensiona para 1200x800 (D5, `994ba55`) | Bug real e corrigido, mas não era a causa |
| StrictMode duplicando o motor (D6.2, `642c98b`) | Só 1 instância sobrevive |
| Pixel vazio no buffer (D6.1) | Buffer sempre correto (lê o canvas de baixo) |
| Repintura da janela (D7, `eda65ad`) | `webContents.invalidate()` não ajudou |
| Canvas escondido por CSS (D8, `e84a12e`) | Não detectou: a checagem EXCLUÍA o `upper-canvas` da lista de suspeitos |
| GPU/driver (D9, `a77d4e7`) e oclusão/throttling/nudge de janela (D10, `80ba16f`) | Sem efeito; minimizar/restaurar também não |

D5, D7, D9 e D10 ficam no código como mecanismos desligados por padrão (D9/D10, por variável de ambiente)
ou inofensivos (D5, D7). Candidatos a limpeza futura, sem urgência.

## Lições (também em `AGENTS.md`)
1. Bug visual só se prova com captura de TELA real, inspecionando a pilha de camadas do DOM, não lendo o
   buffer do canvas.
2. Um diagnóstico que exclui de propósito o suspeito (D8 ignorou `upper-canvas`) não pode descartá-lo.
3. Log limpo do dono não prova ausência de bug: os dados estavam certos e a tela errada.
4. O dono acertou desde o início ("parece colar objetos por cima"): era literalmente uma camada por cima.
5. Correções para a máquina do dono (desligar overlay, GPU etc.) não servem: o produto roda em milhares de PCs.
