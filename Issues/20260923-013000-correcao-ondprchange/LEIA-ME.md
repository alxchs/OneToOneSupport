# Issues - correção do redimensionamento errado em onDprChange (2026-09-23)

- `ordem-correcao.md`: D5, ÚNICO objetivo — corrigir `onDprChange` em `src/shared/canvas/engine.ts:432-435`,
  que chama `this.setDimensions(this.virtualWidth, this.virtualHeight)` (1200×800, o tamanho VIRTUAL/
  canônico da cena) em vez do tamanho REAL do container na tela, toda vez que o navegador dispara um evento
  de mudança de resolução/DPR via `matchMedia`.
- Contexto: 4ª rodada real sobre "o desenho some" (rodadas 3 e 5 nos logs/GIF do dono), mas a PRIMEIRA com um
  bug concreto e lido no código que explica um sumiço puramente visual sem perda de estado — os logs do
  dono (`docs/reviews/diagnostico-sync-3.md`, e o log colado depois do GIF) mostram consistentemente que o
  reducer NUNCA perde elementos (`removidos` sempre `[]`, contagem só cresce) mesmo quando o desenho some da
  tela. Isso aponta para um bug de RENDERIZAÇÃO/DIMENSIONAMENTO, não de dados — e `onDprChange` é o único
  lugar do código que redimensiona o canvas passando o tamanho ERRADO.
- Por que os repros automatizados do chefe nunca pegaram isso: `matchMedia('(resolution: Xdppx)')` só dispara
  o evento `change` quando o SISTEMA OPERACIONAL de verdade muda a densidade de pixels efetiva da janela
  (monitor real, escala do Windows, trocar de monitor, etc.) — um Electron controlado por Puppeteer/CDP com
  `--force-device-scale-factor` fixo, rodando numa VM/janela sem esse tipo de evento nativo, muito
  provavelmente nunca dispara esse `change` na prática, então o bug nunca apareceu nos testes do chefe.
