# Issues - rever o quadro de uma sessão encerrada (2026-09-24)

- **Achado (medido, não suposto)** pela varredura do chefe: ao encerrar uma sessão, a interface deixa de
  oferecer qualquer caminho para rever o quadro dela. Em `src/host/pages/DetalheAtendidoPage.tsx:455` todo o
  bloco com "abrir quadro" / "iniciar servidor" / "encerrar sessão" está dentro de `{ativa && (...)}`. Com a
  sessão encerrada sobram apenas `btn-voltar-lista`, `btn-editar-detalhe`, `btn-status-detalhe` e
  `btn-abrir-nova-sessao`.
- Os dados NÃO se perdem: o log de eventos é append-only no SQLite. O que falta é caminho na interface.
- **Decisão do dono (2026-09-24): prioridade agora**, como parte de deixar o Host funcional.
- Achado que simplifica muito o trabalho: **o canal IPC necessário JÁ EXISTE e já está exposto** —
  `evento:obter-estado` / `desktopAPI.eventos.obterEstadoAba(sessao_id, aba_id)`
  (`src/shared/ipc-contract.ts:243`, `electron/preload.ts:146`), e a store já o usa em `abrirQuadroSessao`.
  NÃO é preciso criar IPC novo nem usar `salvarRevisao`/`carregarRevisao` (isso é o recurso maior de
  versões/snapshots, para outro momento).
