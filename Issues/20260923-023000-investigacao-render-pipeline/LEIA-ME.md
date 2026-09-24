# Issues - investigação do pipeline de renderização (não do reducer) — 2026-09-23

- `ordem-correcao.md`: 7ª rodada sobre "o desenho some". A camada de eventos/reducer está **provada limpa**
  em SEIS logs reais consecutivos do dono (nunca um `removidos` não-vazio, contagem sempre cresce) — inclusive
  DEPOIS da correção de D5 (onDprChange), que era real mas não resolveu o sintoma relatado. O chefe tentou
  reproduzir por automação (CDP síncrono, CDP com traço cursivo longo, com Guest real conectado, em modo DEV
  com StrictMode, e com entrada real do Windows via SendInput) e NÃO conseguiu reproduzir nenhuma vez.
- Conclusão forçada pela eliminação: o problema não está em "o que aconteceu" (dados/eventos) — está em
  "o que a tela mostra" (pintura/composição do canvas), e é algo que só acontece no ambiente real do dono,
  não nos ambientes de automação testados até agora.
- Pedido: NÃO proponha mais uma correção especulativa. Implemente um diagnóstico que prove, da PRÓXIMA vez
  que o dono testar, se os pixels realmente sumiram do canvas (bug de pintura) ou se só o Fabric.js parou de
  agendar o repaint (bug de "quem manda pintar"), sem exigir do dono nenhum passo extra além do que ele já
  faz (rodar `tools\homologar.ps1` e colar o terminal).
