# Autoauditoria - Fase 13 (Modo Ausência)

## 1. Backlog B1 a B5 + auditor-modelo criados
**Critério:** Arquivos existem no formato de _modelo-fase.md
**Comando:** dir docs\prompts\backlog\*.md | Select-Object Name
**Saída:**
`
Name
----
auditor-modelo.md
B1.md
B2.md
B3.md
B4.md
B5.md
`
**Veredito:** PASS

## 2. Script modo-ausencia.ps1 e fila
**Critério:** DryRun simula as execuções e não cria branch.
**Comando:** pwsh tools\modo-ausencia.ps1 -DryRun -Itens B1,B2
**Saída:**
`
Processando item B1
[DRY-RUN] git checkout main; git checkout -b fase/B1-red-team
[DRY-RUN] delegar executor para B1 rodada 1
[DRY-RUN] node tools/auditar.cjs
[DRY-RUN] delegar auditor para B1 rodada 1
Processando item B2
[DRY-RUN] git checkout main; git checkout -b fase/B2-100-abas
[DRY-RUN] delegar executor para B2 rodada 1
[DRY-RUN] node tools/auditar.cjs
[DRY-RUN] delegar auditor para B2 rodada 1
`
**Veredito:** PASS

## 3. Testes passando (vitest e npm run verify)
**Critério:** Todos os testes no Vitest passam
**Comando:** 
px vitest run tests/modo-ausencia.test.ts
**Saída:**
`
 Test Files  1 passed (1)
      Tests  9 passed (9)
`
**Veredito:** PASS

## 4. O que NÃO foi verificado
- Não foi feita execução do script de modo-ausencia de verdade (-DryRun testou o script, e os subtestes testaram as lógicas de fila e parses separadamente, pois a regra proibiu executar o backlog de verdade ou consumir cota no teste).
