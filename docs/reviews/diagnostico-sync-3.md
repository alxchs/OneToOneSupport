# Diagnóstico sync — rodada 3 (2026-09-23)

## Log real colado pelo dono (D1 em produção, `tools\homologar.ps1`)

Colado integralmente pelo Alexandre após "várias tentativas de desenhar". Não editado, não resumido — a
análise abaixo é sobre o texto exatamente como recebido.

Resumo estrutural do que o log contém (8 traços de lápis ao todo, `isEraser:false` em todos os
`path:created`):

| Traço | Origem | Timestamp | `visiveisAntes → visiveisDepois` | `removidos` |
|---|---|---|---|---|
| 1 | Host (`path:created`) | 00:30:40.535 | 0 → 1 | `[]` |
| 2 | Guest (`guestEventReceived`) | 00:31:08.077 | — → 2 | `[]` |
| 3 | Guest | 00:31:16.361 | — → 3 | `[]` |
| 4 | Guest | 00:31:20.735 | — → 4 | `[]` |
| 5 | Guest | 00:31:25.373 | — → 5 | `[]` |
| 6 | Guest | 00:31:29.606 | — → 6 | `[]` |
| 7 | Host (`path:created`) | 00:31:37.111 | 6 → 7 | `[]` |
| 8 | Host (`path:created`) | 00:31:39.195 | 7 → 8 | `[]` |

## O que o log PROVA

1. **A camada de eventos/reducer/persistência está saudável.** `totalVisiveis` só cresce (0→1→2→…→8),
   `removidos` é `[]` em toda linha. Nenhum `DRAW_HIDE`, `CLEAR_TAB` ou `UNDO` aparece no log. Ou seja: nada
   no reducer está apagando os traços anteriores — cada traço novo do dono (Host ou Guest) foi persistido
   e ficou marcado como visível junto com os anteriores.
2. **O caminho Host→Guest e Guest→Host está funcionando nos dois sentidos**: o traço 1 (Host) tem
   `broadcastToGuest`/`chegada no Guest` confirmados; os traços 2–6 chegaram via `guestEventReceived` →
   `autoridade permitido:true` → `guestEventPersisted`, ou seja, o dono alternou entre desenhar no Host e no
   celular (Guest) durante o teste, e os dois lados aceitaram os traços um do outro.

## O que o log NÃO PROVA (e por isso a queixa não está refutada)

O log de D1 (por desenho, feito para não exigir DevTools) carrega só `tipo`/`autor`/`elementId`/contagens —
**nunca geometria** (`left`/`top`/largura/altura, quantidade de pontos do traço) **nem pixel**. Então ele
não consegue confirmar ou negar a queixa real do dono: "continua apagando ao finalizar" e "parece colar em
cima de alguma coisa, não escrever" são queixas sobre o que aparece NA TELA, e nada nesse log descreve a
tela.

## Repro automatizado que executei — NÃO reproduziu (evidência negativa real)

Escrevi e rodei (build de produção atual, `dist/`, DPR 1.5, Electron real via Puppeteer/CDP — não é
unit test) um script que: abre o quadro branco do Host, desenha 3 traços de lápis em 3 regiões bem
separadas do canvas (canto superior-esquerdo, meio, canto inferior-direito), com 500ms de espera entre
cada um, e mede pixels não-transparentes **por região** (não só o delta global que `tools/probe-runtime.cjs`
mede) depois de CADA traço novo.

Resultado real (colado, não inventado):
```
[
  { "afterStroke": "canto-sup-esq", "regions": { "canto-sup-esq": 1165 } },
  { "afterStroke": "meio", "regions": { "canto-sup-esq": 1165, "meio": 1241 } },
  { "afterStroke": "canto-inf-dir", "regions": { "canto-sup-esq": 1165, "meio": 1241, "canto-inf-dir": 1226 } }
]
Badge elementos (contagem do reducer): Elementos Visíveis: 3
RESULTADO: NÃO reproduziu — todas as regiões mantiveram os pixels após traços subsequentes
```
Nenhuma região perdeu pixel ao desenhar a região seguinte. Isso **não prova que o bug não existe** — só
restringe onde ele pode estar: traços bem separados, pausados, um de cada vez, não reproduzem. O uso real
do dono ("escrever" à mão livre) envolve traços RÁPIDOS, PRÓXIMOS/SOBREPOSTOS entre si, o que este repro e
a sonda `tools/probe-runtime.cjs` (V3, que só mede 1 forma por vez com canvas limpo antes/depois) nunca
testaram.

## Conclusão e próximo passo

Não vou propor mais uma "causa raiz" adivinhada. Os dois instrumentos que temos hoje (log de eventos D1 e
sonda de pixel V3) são cegos exatamente para o cenário relatado (traços rápidos/sobrepostos, e a aparência
visual do canvas ao longo do tempo). A ordem D2 (`Issues/20260923-004106/ordem-correcao.md`) pede um
terceiro instrumento: captura de PNG do canvas do Host amarrada ao mesmo timeline de terminal que D1 já
criou, e uma sonda automatizada que desenhe traços rápidos/próximos (não pausados) para tentar reproduzir
de verdade antes de qualquer correção de código.
