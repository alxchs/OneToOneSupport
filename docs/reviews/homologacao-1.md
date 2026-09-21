# Revisão da correção da Homologação 1 (branch fase/07-homologacao-1)
Revisor: Claude Code (chefe). Veredito: **APROVADA COM RESSALVAS; falta o reteste físico do dono**.
Origem: teste real (Host Windows + Motorola Edge 70 Pro) reprovou sincronização Host<->Guest, traço que some no celular e borracha de objeto inteiro.
## Causa raiz (do diagnóstico do agy, docs/reviews/diagnostico-sync.md; conferida no código pelo chefe)
- **H2:** `crypto.randomUUID` não existe em contexto NÃO seguro (HTTP no IP da rede). Por loopback (127.0.0.1) o navegador trata como seguro, por isso a sonda e os testes antigos nunca pegaram: falso PASS estrutural. Corrigido com `generateUUID()` (`src/shared/events/protocol.ts`, usa `crypto.getRandomValues`; `Math.random` só como último recurso).
- **H1:** vários defeitos somados: servidor descartava `id`/`tipo` do elemento ao persistir, `broadcastToGuest` em `catch` silencioso, UNDO/REDO não tratados nos dois lados, Guest não recebia o estado ao conectar.
## Conferido pelo chefe
- Auditor: verde (241 testes, sonda 24/24). Reexecutei `npm run probe` duas vezes: sincronização bidirecional por IDs, borracha de trecho, UNDO/REDO bidirecionais, barra visível, DPR 1.5, sem erros.
- **H4 provado:** a sonda não altera mais o banco real (arquivos em %APPDATA%\OneToOneSupport com data anterior às minhas duas execuções).
- Busca no Guest/shared: nenhum outro `randomUUID`/`crypto.subtle`/`getUserMedia` fora do fallback.
## Ressalvas
1. **Falso PASS no H3:** a ordem exigia amostragem de pixels (apagar só a ponta deixa o resto visível). O teste (a) só checa `globalCompositeOperation === 'destination-out'`, e a autoauditoria marcou PASS como se cobrisse o critério. O efeito visual real NÃO foi provado por máquina.
2. Não testado em aparelho físico (o próprio agy declara).
3. **Alerta de arquitetura para a Fase 08:** o Guest roda em contexto não seguro (HTTP em IP de LAN). `getUserMedia` (microfone/câmera) e outras APIs só funcionam em contexto seguro; o WebRTC/áudio da fase 08 exige decisão (HTTPS com certificado local aceito no celular, ou outra estratégia) ANTES de implementar. Registrar em ADR.
4. O banco real foi limpo por mim (ordem do dono) após restos de teste do agy (2 atendidos).
Não verificado pelo chefe: efeito visual da borracha; diff completo; aparelho físico.
