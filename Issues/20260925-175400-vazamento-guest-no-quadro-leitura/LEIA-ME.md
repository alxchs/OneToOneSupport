# Defeito achado pelo chefe na auditoria da Fase 08 (D12–D16)

**Quem achou:** chefe técnico (Claude Code), auditoria de 2026-09-25, atacando a entrega do D16.
**Auditor automático (`node tools/auditar.cjs`): TUDO VERDE** — 354 testes, sonda 36/36, 243 afirmações
conferidas. Este defeito passou por baixo de todos eles, porque todos os testes do D16 exercitam o caminho
LOCAL (Host desenhando) e nenhum exercita o caminho REMOTO (Guest desenhando) com o quadro em leitura aberto.

## O que acontece

Cenário real e nada exótico (é justamente o caso de uso do D16): o professor está com uma sessão VIVA, com o
aluno conectado pelo celular, e abre o quadro de uma sessão ENCERRADA para rever ("Ver quadro (somente
leitura)"). Enquanto ele revê o histórico, **cada traço que o aluno faz no celular aparece desenhado em cima
do quadro histórico**, que a própria tela promete ser "permanente e imutável".

O banco não é corrompido (os eventos continuam gravados na sessão viva; a sessão encerrada fica com a mesma
contagem de eventos — a trava do `EventoService` funciona). O estrago é de integridade visual do que o dono
está revendo: ele vê como "aula passada" um traço que é da aula de agora, e o botão "Exportar PNG HiDPI"
salva essa mistura.

## Causa raiz

`src/host/HostApp.tsx` (linhas ~50–71): o evento vindo do Guest é aplicado **direto** no estado do quadro
(`reduceEvent` + `useHostStore.setState({ tabState })`), sem passar por `aplicarEventoQuadro` — que é onde o
D16 pôs a trava `quadroSomenteLeitura`. De quebra, esse caminho **não confere de que sessão o evento veio**:
ele carimba o evento com `activeSessaoId` (a sessão que estiver aberta na tela) em vez de usar a sessão que o
servidor realmente está servindo. O bloqueio "em múltiplas camadas" do D16 (interface, motor, store, backend)
não cobre esta porta.

## Como reproduzir (comando real, roda em ~2 min)

```
npm run build
node Issues/20260925-175400-vazamento-guest-no-quadro-leitura/evidencia/ataque-readonly-guest.cjs
```

O script sobe o app empacotado com banco isolado, cria atendido, abre a sessão 1, desenha, encerra a sessão
1, abre a sessão 2 (viva), conecta um Guest mobile emulado pelo IP de LAN real, abre o quadro da sessão 1 em
somente leitura e manda o Guest desenhar. Sai com código 1 quando o vazamento acontece.

Saída real de 2026-09-25 (duas execuções idênticas):

```
[Ataque] Modo leitura: {"badge":true,"aviso":true,"semLapis":true} | elementos=1 | pixels de tela=14750
[Ataque] CONTROLE -> Guest desenhou de verdade? elementos no Guest 2 -> 4
[Ataque] CONTROLE -> eventos da sessao VIVA no SQLite: 2 -> 4 | eventos da sessao ENCERRADA: 1
[Ataque] Depois do desenho do Guest: elementos=3 (novos: 2) | pixels de tela=20575 (delta 5825)
[RESULTADO] FALHA DA TRAVA: o quadro em SOMENTE LEITURA recebeu 2 elemento(s) de outra sessão; pixels na tela +5825
```

O **controle** é a parte que importa: a primeira versão deste ataque deu "trava resistiu" porque o Guest não
tinha desenhado (as coordenadas caíam fora do canvas). Só depois de o controle provar que o Guest desenhou de
verdade (2 → 4 elementos e 2 → 4 eventos no SQLite) o resultado passou a valer.

## Evidência

- `evidencia/ataque-readonly-guest.cjs` — o ataque (Electron real + Guest mobile real por LAN).
- `evidencia/leitura-antes.png` / `evidencia/leitura-depois.png` — captura de TELA do quadro em somente
  leitura antes e depois do aluno desenhar; a contagem de pixels coloridos na tela sai de 14750 para 20575.
- `evidencia/ataque-toque-host.cjs`, `evidencia/a2-toque-selecao.png`, `evidencia/a3-toque-leitura.png` —
  dois outros ataques do chefe que a entrega **resistiu** (arraste por toque no modo seleção; desenho por
  toque no modo leitura).
