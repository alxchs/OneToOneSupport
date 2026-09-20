# ORDEM DE SERVIÇO — FASE 10: Empacotamento e aceite da V1.0
Branch: `fase/10-empacotamento-aceite` (confirme; se não estiver nela, pare). Você é executor; o chefe técnico é o Claude Code.
Leia: `AGENTS.md`, Mestre §14 e §18, `docs/HANDOFF.md`. Pré-requisito: fases 01–09 mergeadas.

## Entregas
1. `electron-builder.yml` para Windows (NSIS + portable), módulos nativos (`better-sqlite3`, `sodium-native`) desempacotados do asar e recompilados para o Electron, ícone **sem vermelho** (peça paleta ao Alexandre se ainda não houver).
2. Firewall: regra do Windows para a porta dinâmica do Express (perfil privado, escopo local), criada com elevação explícita e consentimento na UI, removível na desinstalação; sem abrir para a internet. Documentar o que é feito.
3. Assinatura/permissões: documentar o SmartScreen; não inventar certificado.
4. CI: workflow do GitHub Actions em `.github/workflows` (remoto é GitHub, ADR-007) que roda typecheck, testes e build. **Tem que ser executado de verdade** (dispatch/execução local equivalente com `act` ou script) e o log real colado no HANDOFF. Sem execução, escreva "não executado" — não "pronto".
5. Testes de aceite V1.0 automatizados onde possível: duplicidade via EXISTS sem lixo no banco (contagem de linhas), sincronia < 200 ms em LAN (medir e registrar p50/p95/máximo, 1000 amostras), assets em `%APPDATA%`, binário instalado e aberto.
6. Documentação final: README, `docs/ARQUITETURA.md` **derivada do código atual** (não copiada do Mestre; toda afirmação conferida), guia de release, limitações conhecidas.
7. Checklist de segurança: revisão de CSP, IPC, cripto, path traversal, dependências (`npm audit`).

## Verificação (cole no HANDOFF)
Build do instalador, instalar numa pasta limpa, abrir o binário, rodar uma sessão completa host+guest, medir latência, gerar PDF, conferir arquivamento. Log real de CI.
## Aceite
Todos os quatro critérios da §18 com evidência; nenhuma afirmação sem prova. Nada de push. HANDOFF e parar.
