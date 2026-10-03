# Autoauditoria — Fase 13: modo ausência da AGY

## Rodada 2

1. `-DryRun` altera e apaga estado: `Salvar-Fila` removido no bloco de dry run e garantido ler/filtrar separados para não apagar.
   - Comando: `pwsh tools/modo-ausencia.ps1 -DryRun -Itens B1,B2; git status --porcelain; git diff --stat`
   - Saída: `Processando item B1... (vazio em git status)` - PASS
2. A `FILA.md` inicial tem 2 itens e `Rodadas = 1`: `FILA.md` regravada com B1..B5 e `Rodadas = 0`.
   - Comando: `Get-Content docs/FILA.md | Select-Object -First 7`
   - Saída: `| B1 | fase/B1-red-team | PENDENTE | 0 | - | - | - |` - PASS
3. A correção nunca chega ao executor: Adicionada regra que injeta o `$ultimaRejeicao` no prompt de reexecução e salva em arquivo temporário na rodada > 1.
   - Comando: `cat tools/modo-ausencia.ps1 | grep -i "CORREÇÃO OBRIGATÓRIA"`
   - Saída: `$novoTexto = $promptText + "\n\n## CORREÇÃO OBRIGATÓRIA...` - PASS
4. O auditor não sabe qual arquivo escrever: `auditor-modelo.md` atualizado com placeholders substituídos antes de delegar.
   - Comando: `cat tools/modo-ausencia.ps1 | grep "replace '\{\{BRANCH\}\}'"`
   - Saída: `$auditorContent = $auditorTemplate -replace '\{\{BRANCH\}\}', $branch...` - PASS
5. `git checkout -b` quebra na 2ª execução: Verificação via `git branch --list` inserida; `ia claim/release` adicionado.
   - Comando: `ia status` após `pwsh tools/modo-ausencia.ps1 -DryRun`
   - Saída: `claim=agy: fase 13 rodada 2` (apenas a sessão atual, sem sujeira da simulação) - PASS
6. Parada 1 incompleta (429): Laço `foreach ($m in @($null, "flash"))` implementado. Se esgotar, grava `Cota = Atingida` e `Status = BLOQUEADA`.
   - Comando: `cat tools/modo-ausencia.ps1 | grep "Cota 429"`
   - Saída: `Write-Host "Cota 429 no executor (modelo $($m))."` e "Parada obrigatória: Cota 429" - PASS
7. Sem reserva de checkout: Inserido `ia claim agy "$($item.ID)"` antes e `ia release agy` no fim ou catch.
   - Comando: `cat tools/modo-ausencia.ps1 | grep "ia claim agy"`
   - Saída: `ia claim agy "$($item.ID)"` - PASS
8. Executor sem `-ExigirCommit`: Parâmetro `-ExigirCommit` adicionado à execução de `delegar.ps1 -Papel executor`.
   - Comando: `cat tools/modo-ausencia.ps1 | grep "ExigirCommit"`
   - Saída: `pwsh -File tools/delegar.ps1 -Ordem "$ordem" ... -ExigirCommit ...` - PASS
9. Auditor sem prova: Validação `### D1 ... ```saida```` exigida em `Parse-Veredito` usando Regex.
   - Comando: `npx vitest run tests/modo-ausencia.test.ts | grep "Parse-Veredito"`
   - Saída: `✓ modo-ausencia.ps1 > Parse-Veredito > deve rejeitar e extrair motivo (controle positivo)` - PASS
10. Teste ausente para o laço: `Test-Parada` extraído e validado com testes para todas as condições lógicas.
    - Comando: `npx vitest run tests/modo-ausencia.test.ts | grep "DryRun e Paradas"`
    - Saída: `✓ modo-ausencia.ps1 > DryRun e Paradas > Teste do laço - Parada 3 (Mesmo defeito 2x)` - PASS

**O que NÃO foi verificado:**
- A execução integral do pipeline (comunicação LLM real) não foi disparada por estar sob dry-run nesta fase.
