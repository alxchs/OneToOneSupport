# ORDEM DE SERVIÇO — FASE 02: Domain Services, IPC e shell do Host
Branch: `fase/02-servicos-ipc-host` (confirme; se não estiver nela, pare). Você é executor; o chefe técnico é o Claude Code.
Leia: `AGENTS.md`, Mestre, `docs/FASES.md`, `docs/HANDOFF.md`, ADRs. Pré-requisito: fase 01 mergeada.

## Entregas
1. `electron/services/atendido.service.ts`, `sessao.service.ts`, `config.service.ts` (Domain Services; toda regra vive aqui): CRUD de atendidos com soft delete (`ativo=0`, `deletado_em`), purga física só se sessão encerrada há > 10 anos, criação/encerramento de sessão (`status`: `ativa`, `encerrada`), dicionário dinâmico (chaves `rotulo.host`, `rotulo.guest`, `rotulo.sessao` etc. com defaults) — sempre via repositórios com a regra `NOT EXISTS` da Regra #1.
2. Repositórios `sessao.repo.ts` (sem regra de duplicidade exigida, mas nunca crie sessão órfã: FK ligada).
3. `electron/ipc/router.ts`, `atendido.ipc.ts`, `sessao.ipc.ts`, `config.ipc.ts`: canais com nomes constantes compartilhados em `src/shared/ipc-contract.ts`, payloads validados (zod ou validação manual) **no Main**, erros tipados (`DUPLICATE`, `NOT_FOUND`, `VALIDATION`). Preload expõe só esses métodos.
4. Renderer Host em `src/host/`: Vite + React 18 + Zustand. Páginas: lista de atendidos (busca), formulário, detalhe com sessões, configurações do dicionário. Zero regra de negócio: só chama IPC e mostra. Mensagem clara quando `DUPLICATE`.
5. Layout legível em 3840x2160 @150% (unidades relativas, sem tamanhos fixos que fiquem minúsculos). Tema sem vermelho em nenhum elemento (erros e alertas em âmbar/laranja escuro sobre fundo azul-escuro/neutro, nunca vermelho, nunca vermelho+amarelo).
6. Testes: services (regras, soft delete, purga 10 anos com relógio injetável), contrato IPC (validação rejeita payload ruim), Renderer não importa nada de `electron/`.

## Verificação (cole no HANDOFF)
`npm run typecheck` · `npm test` · `npm run build` · `npm run dev` e **usar a UI de verdade**: criar atendido, tentar criar o mesmo de novo (deve mostrar duplicado), editar, desativar, mudar o rótulo Psicólogo→Professor e ver refletir. Descreva o que viu.

## Aceite
Tudo acima verde; grep prova que `src/` não contém SQL nem acesso a `fs`/`better-sqlite3`; nenhum dado duplicado após a sequência de UI acima (consultar o banco e colar o resultado).
## Não fazer
Servidor, WS, cripto, canvas. Nada de push. Encerrar com HANDOFF (seção 17) e parar.
