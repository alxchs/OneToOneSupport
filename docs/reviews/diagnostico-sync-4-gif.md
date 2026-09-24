# Diagnóstico sync — rodada 4 (2026-09-23): o GIF do dono refuta a teoria do "flicker"

## O que o dono mandou
Um GIF (260 quadros, 200ms cada, 52s) gravando a tela real durante o teste, aberto no quadro branco do
Host (`tools\homologar.ps1`, build `v17906df`, modo DEV com Vite + React StrictMode).

## O que os quadros mostram (extraídos e inspecionados individualmente, não presumido)
1. Quadro 070–088: o dono desenha um traço longo e cursivo (tipo "M") com o mouse pressionado. O traço
   acumula normalmente enquanto o botão está pressionado.
2. Quadro 088 → 089 (uma única transição de 200ms, exatamente quando o botão é solto): **o traço inteiro
   desaparece e o canvas fica 100% vazio.**
3. Quadros 090–150+: o canvas **permanece vazio indefinidamente** (não é um piscar de 1 frame — passa mais
   de 1 segundo, dezenas de frames, sem o traço voltar).
4. O dono muda de cor (roxo) e desenha outro traço cursivo (quadros ~100–115): **mesmo resultado exato** —
   acumula durante o traço, desaparece por completo e para sempre assim que solta o botão.
5. Muda para a ferramenta Pincel (quadros ~200–210): **terceira reprodução idêntica.**
6. Em nenhum momento dos 260 quadros um traço finalizado permanece visível.

**Conclusão direta:** isto NÃO é um "flicker" de 1 frame por causa de uma corrida `requestAnimationFrame`
vs `useEffect` (a explicação que a investigação anterior do agy, `docs/reviews/investigacao-mouseup.md`,
propôs e mediu em ~1,5–2,2ms). É uma perda **permanente, 100% reprodutível, de 3/3 tentativas visíveis no
GIF**. A teoria do "flicker" está **refutada por evidência direta** — não descrevo mais isso como causa
confirmada. `Issues/20260923-011000-correcao-flicker-traco` (D3) fica **pausada/superada**: a correção ali
proposta (reaproveitar o objeto Fabric em vez de remover e recriar) pode ainda ser uma boa ideia arquitetural,
mas não é a correção do bug relatado, porque o bug real não é uma janela de milissegundos.

## O que tentei reproduzir por automação (3 tentativas reais, nenhuma reproduziu)
1. **Produção, traço longo e curvo (221 pontos, autointersectante, sem guest conectado):** não reproduziu —
   o traço permaneceu (7453px antes e depois de 1,5s).
2. **Produção, mesmo traço, COM um Guest mobile real conectado** (Chrome headless emulando Motorola Edge 70
   Pro, via IP LAN real, replicando a topologia do dono): não reproduziu.
3. **Modo DEV real** (Vite dev server + `React.StrictMode` ativo, replicando exatamente como
   `tools\homologar.ps1` roda — não `NODE_ENV=production` como nos testes 1 e 2): não reproduziu.

Ou seja: nem complexidade do traço, nem Guest conectado, nem modo dev/StrictMode isoladamente reproduzem o
bug nas minhas tentativas. Isso não prova que nenhum desses fatores importa — só que a combinação exata que
o dono usa (provavelmente: sessão já aberta há mais tempo, várias trocas de ferramenta/cor antes, talvez
alternância Host/Guest como no log da rodada 3, e input humano real de mouse, não sintético via CDP) ainda
não foi replicada.

## O que fiz em vez de continuar adivinhando (D4 — visibilidade, não correção)
Segui o mesmo princípio que já funcionou em D1 (Issues/20260922-013720): quando a IA não consegue reproduzir
o que o humano reproduz de forma confiável, o primeiro passo é tornar a falha real visível, não tentar mais
uma correção às cegas. D1 encaminhou os checkpoints de diagnóstico para o terminal; faltava encaminhar
**exceções JavaScript não tratadas e promises rejeitadas sem catch** — hoje elas só aparecem no console do
DevTools (que o dono nunca abre), e uma exceção lançada no meio do listener de `path:created`
(`engine.ts:465-508`, entre a remoção do traço na linha 475 e a emissão do evento na linha 507) explicaria
perfeitamente uma perda **permanente e silenciosa**: o traço é removido do canvas, mas a exceção interrompe
o código antes de `emitEvent`, então o evento nunca chega ao reducer e nunca é readicionado.

Implementado (mudança pequena, sem risco, `npm run verify` e sonda 27/27 continuam verdes):
- `installGlobalErrorForwarding('host' | 'guest')` em `src/shared/diag.ts`: escuta `window.error` e
  `window.unhandledrejection` e encaminha para o mesmo canal de D1 (`diagLog` → IPC `diag:forward` →
  `[DIAG-HOST]` no terminal), sob a mesma flag `ONETOONE_DIAG=1`, nunca em produção.
- Chamado o mais cedo possível em `src/main.tsx` (Host) e `src/guest/main.tsx` (Guest), antes de qualquer
  outra coisa renderizar.

## Próximo passo real
Peço ao dono para repetir EXATAMENTE o mesmo teste (`tools\homologar.ps1`, escrever cursivamente, várias
tentativas) e colar o terminal de novo. Se houver uma exceção no meio do ciclo, agora ela vai aparecer como
`[DIAG-HOST] [erro_nao_capturado]` ou `[DIAG-HOST] [promise_rejeitada_sem_catch]` no mesmo texto que ele já
sabe copiar. Se aparecer, temos a causa raiz real, com stack trace, sem adivinhar mais nada. Se NÃO aparecer
nenhuma exceção mesmo com o bug reproduzindo, isso também é informação real: descarta exceção JS como causa
e aponta para algo fora do alcance de `window.onerror` (ex.: um estado descartado silenciosamente, ou algo
específico do ambiente dele — GPU/driver, extensão do Chromium/Electron, monitor 4K real vs a resolução que
eu testei).
