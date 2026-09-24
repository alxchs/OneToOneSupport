# Varredura funcional do Host — 2026-09-24 (chefe técnico)

Feita em worktree isolada (`git worktree`) enquanto o executor trabalhava na árvore principal, sobre o
commit `ac881f6` (base: correção do upper-canvas `099787e` + D12 `4791e22`). Build de produção, Electron
real, DPR 1.5. Método obrigatório do AGENTS.md: prova por **captura de TELA** (`page.screenshot`), não por
leitura do buffer do canvas.

## Resultado resumido
Um defeito encontrado (ferramenta Texto) e **nenhum outro**. Dois alarmes que eu mesmo levantei e depois
derrubei como erro do meu teste — registrados abaixo para ninguém reinvestigar à toa.

## Defeito encontrado
**Ferramenta Texto não aceita digitação** (bug antigo, da Fase 06, não regressão do D12). Ordem emitida:
`Issues/20260924-180000-texto-nao-aceita-digitacao`. Causa e reprodutor no LEIA-ME da ordem.

## O que passou (cada item com prova real)
| Área | Verificação | Resultado |
|---|---|---|
| 6 ferramentas de desenho | lápis, pincel, retângulo, elipse, linha, seta deixam pixel na TELA | todas OK |
| Desfazer/Refazer | 1x, 2x seguidos, desfazer tudo (6x), refazer tudo (6x) | OK |
| Pilha de refazer | novo desenho invalida o refazer pendente | OK |
| Borracha de trecho | apaga pixel na tela (`destination-out` sobre o fundo branco) | OK |
| Borracha de objeto | remove o objeto sob o cursor | OK |
| Seleção | ainda seleciona objeto (regressão do D12 conferida) | OK |
| Limpar Tela | volta a zero pixel colorido | OK |
| Exportar PNG | 14.167 px coloridos, **0 px transparente** (ADR-012 cumprido) | OK |
| Cor e espessura | verde `#059669` e 16px aplicados ao traço seguinte | OK |
| Precisão do clique | erro ≤ 1,7 px de cena na base e após cada operação de janela | OK |
| Redimensionar janela (Win32 real) | esticar, encolher, maximizar, restaurar | desenho preservado e clique preciso |
| Mudança de escala de tela (DPR 1.5↔1.0) | conversão de coordenada | OK (≤ 1,6 px) |
| Sair do quadro e voltar | mesma quantidade e mesmas posições | OK |
| Reabrir sessão antiga | mostra os desenhos DELA, não os da sessão nova | OK |
| Outro atendido | quadro novo abre vazio (sem vazamento entre pessoas) | OK |
| Fechar e reabrir o APP (mesmo banco) | cadastro, sessão e 3 desenhos voltam idênticos, 7.560 px na tela | OK |
| Console do renderer | nenhum erro durante toda a varredura | OK |

## Alarmes falsos que eu levantei e derrubei
1. **"Depois de redimensionar, o desenho não cai onde o mouse clica (65 px)"** — era erro do meu teste: li a
   posição do canvas antes de o layout reassentar e cliquei com coordenada velha. Refeito lendo a posição
   imediatamente antes de cada clique, com redimensionamento real via Win32: erro ≤ 1,7 px em todos os casos.
2. **"Reabrir sessão antiga mostra desenho de outra sessão"** — era erro do meu teste: a lista de sessões usa
   `ORDER BY iniciado_em DESC` (`electron/db/repositories/sessao.repo.ts:141`), então o primeiro botão é a
   sessão MAIS NOVA, e eu cliquei nela esperando a mais antiga. Refeito clicando na correta: bate exatamente.

## Medição de custo do reforço de repaint (D7) — embasa a ordem D14
60 traços de lápis seguidos, mesma máquina, mesmo build, só mudando o reforço:

| | média por traço | p50 | p95 |
|---|---|---|---|
| com o reforço (código atual) | 143 ms | 137 ms | 198 ms |
| sem o reforço | 133 ms | 132 ms | 147 ms |

O grosso desses tempos é do próprio instrumento de teste; o que importa é a diferença: o reforço custa
~10 ms por traço na média e **+51 ms na cauda (p95)**, em todo desenho, em produção — para uma hipótese que
o post-mortem já derrubou. Reforça a decisão de remover (D14).

## Rodada 2 da varredura (mesma worktree, depois dos itens acima)
| Área | Verificação | Resultado |
|---|---|---|
| Sessão longa | 200 traços seguidos: 126 ms nos 20 primeiros, 135 ms no meio, 136 ms nos 20 últimos | sem degradação |
| Reabrir quadro cheio | 200 objetos reconstruídos em **475 ms**, 37.678 px na tela, 14 MB de heap | OK |
| Borracha de trecho, ciclo completo | desenhar 3 traços grossos (38.589 px) → apagar (−1.449 px) → DESFAZER (volta a 38.589) → REFAZER (volta a 37.140) → sair e reabrir (37.140) | OK em todas as etapas |
| Sessão encerrada | após "Encerrar Sessão", procurar caminho para rever o quadro | **ACHADO, ver abaixo** |

## Achado de produto: sessão encerrada perde o acesso ao quadro
Ao encerrar uma sessão, a interface deixa de oferecer QUALQUER caminho para rever o quadro dela. Em
`src/host/pages/DetalheAtendidoPage.tsx:455`, todo o bloco com "abrir quadro", "iniciar servidor" e
"encerrar sessão" está dentro de `{ativa && (...)}`; com a sessão encerrada, os únicos botões que sobram são
`btn-voltar-lista`, `btn-editar-detalhe`, `btn-status-detalhe` e `btn-abrir-nova-sessao` (medido, não
suposto). Os dados NÃO se perdem (continuam no SQLite, e o log de eventos é append-only), mas ficam
inalcançáveis pelo app — num produto cujo propósito é registrar o que foi trabalhado na sessão, isso
merece decisão do dono.

Vale registrar que a base para resolver já existe e está sem uso: `EventoService.salvarRevisao` e
`EventoService.carregarRevisao` (`electron/services/evento.service.ts:348,387`) e a tabela
`Sessoes_Revisoes` (`electron/db/migrations/001_init.sql:32`). Falta o canal IPC (nenhuma menção a revisão
em `src/shared/ipc-contract.ts`) e a tela. Não implementei nada: é decisão de produto.

## O que NÃO foi verificado
- Guest (celular): fora de escopo por decisão do dono (foco no Host).
- Botão "Exportar PNG HiDPI" pelo caminho da UI (diálogo de salvar arquivo): testei o método do motor
  (`toDataURL`), não o diálogo do sistema.
- Bloquear tela do convidado / liberar mídia: dependem do Guest conectado.
- Sessões simultâneas: observei que duas sessões do mesmo atendido ficam "Em Andamento" ao mesmo tempo.
  Não é defeito comprovado, é questão de produto para o dono decidir.
- Texto: como está quebrado, não deu para testar acentuação, multilinha nem edição de texto existente.
