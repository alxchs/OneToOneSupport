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

## Pontos herdados da auditoria da fase 01 (resolver nesta fase)
- Verifique o modo `npm run dev`: o header CSP do `main.ts` (`script-src 'self'`) pode bloquear o script inline do React Fast Refresh. Se bloquear, ajuste o dev (ex.: CSP mais frouxa **só quando `VITE_DEV_SERVER_URL` existir**) sem enfraquecer o build. Prove com a sonda que o build continua com CSP efetiva.
- Estenda `tools/probe-runtime.cjs` para exercitar a UI nova de verdade: criar atendido, tentar o mesmo de novo e ler a mensagem de duplicado, editar, desativar, trocar o rótulo do dicionário. FAIL na sonda = fase não pronta.
- Teste também a validação de payload do IPC com o preload real (chamar canal com dado inválido e ver o erro tipado).

## Verificação e autoauditoria
Siga a seção **Autoauditoria obrigatória** do `AGENTS.md` (clone limpo, `npm run verify`, ataque à própria entrega, `docs/reviews/autoauditoria-02.md`). Além disso cole no HANDOFF a saída da sequência de UI descrita acima e o resultado da consulta ao banco (sem duplicados).

## Aceite
`npm run verify` verde num clone limpo; grep prova que `src/` não contém SQL nem acesso a `fs`/`better-sqlite3`; nenhum dado duplicado após a sequência de UI; CSP do build efetiva; dev mode funcionando.
## Não fazer
Servidor, WS, cripto, canvas. Nada de push. Encerrar com HANDOFF (seção 17) e parar.
