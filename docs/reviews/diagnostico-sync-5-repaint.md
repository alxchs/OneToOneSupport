# Diagnóstico sync — rodada 5 (2026-09-23): confirmado — bug de repintura, não de dados

## O teste decisivo
Pedi ao dono: quando o desenho sumir da tela, clique em "Exportar PNG HiDPI" (`WhiteboardEngine.toDataURL()`,
`engine.ts:1057-1089`, que lê diretamente o `lowerCanvasEl` — o mesmo canvas que aparentemente está vazio na
tela) e veja se o arquivo exportado mostra o conteúdo.

**Resultado: o PNG exportado mostra os 4 traços perfeitamente** (`docs/reviews/evidencia-png-export-vs-tela-vazia.png`)
— 2 traços azuis, 1 laranja, 1 roxo — exatamente o que o dono relatou ter desenhado e que "sumiu" da tela.

## O que isso prova, sem margem para dúvida
1. **Os dados nunca foram perdidos.** O buffer de pixels real do canvas (`lowerCanvasEl`) contém o desenho
   correto o tempo todo — `toDataURL()` lê exatamente esse buffer.
2. **O Fabric.js está com o estado interno correto** — ele não teria como produzir um PNG correto a partir de
   um `_objects` vazio ou de um canvas realmente limpo.
3. **O problema é 100% de composição/repintura da JANELA do Electron/Chromium**, não da aplicação: o
   conteúdo certo existe no canvas, mas a tela que o usuário vê não está sendo atualizada para refletir esse
   conteúdo, até algo (como abrir/fechar um diálogo, redimensionar, ou aparentemente `toDataURL()` em si)
   forçar um repaint real.

## Por que a camada de eventos sempre pareceu limpa
Bate perfeitamente com os 6 logs reais anteriores (`docs/reviews/diagnostico-sync-3.md`,
`docs/reviews/diagnostico-sync-4-gif.md`): o reducer, o `objectsMap` e o próprio canvas do Fabric sempre
estiveram corretos — só a apresentação visual (o "próximo frame" que o compositor do Chromium mostra na
janela) não estava acompanhando.

## Por que os 5 repros automatizados do chefe nunca reproduziram
Automação via CDP (Puppeteer) e capturas de pixel via `getImageData`/screenshot no Puppeteer **leem
diretamente o canvas ou pedem um frame renderizado sob demanda ao Chromium** — o mesmo caminho que
`toDataURL()` usa, e que aparentemente força o repaint que falta no uso real interativo da janela. Ou seja,
o instrumento de medição do chefe (CDP) **mascarava exatamente o bug que estava tentando encontrar**.

## Próximo passo (D6, já despachado para o agy antes desta evidência chegar)
`Issues/20260923-023000-investigacao-render-pipeline` (D6) já pedia, no item D6.4, testar
`--disable-gpu`/aceleração de hardware como hipótese — esta evidência aponta fortemente nessa direção
(bug de composição acelerada por GPU no Chromium/Electron neste hardware). D6.1 (divergência estado-vs-pixel
lida DE DENTRO do app) provavelmente vai mostrar "sem divergência" agora que sabemos que o canvas em si está
correto — o que também é informação útil, e não invalida o resto da ordem (D6.2 StrictMode, D6.3 múltiplos
traços reais, D6.4 GPU).

Candidatos de correção a testar DEPOIS que D6 confirmar o mecanismo exato (não aplicar às cegas):
- Forçar um "reflow"/invalidação síncrona da região do canvas após cada `renderState` (ex.: alternar uma
  propriedade CSS trivial do elemento, ou chamar uma API de invalidação do Chromium/Electron).
- Testar `app.disableHardwareAcceleration()` no processo principal como experimento controlado.
- Verificar se `BrowserWindow` está configurado de um jeito (`transparent`, `frame`, etc.) que é conhecido
  por ter bugs de repaint parcial em certas versões do Electron/Chromium/driver de GPU.
