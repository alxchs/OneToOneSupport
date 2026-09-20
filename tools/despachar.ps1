<#
  Despacha uma fase para o Antigravity CLI (agy) em modo headless, dentro da branch da fase.
  Uso: tools\despachar.ps1 -Fase 01 [-Modelo <nome>] [-Esforco low|medium|high]
  NUNCA faz push. O agy roda com --mode accept-edits (edições aprovadas; demais ações seguem as permissões do próprio agy).
#>
param(
  [Parameter(Mandatory)][string]$Fase,
  [string]$Modelo,
  [ValidateSet('low','medium','high')][string]$Esforco = 'high',
  [string]$Extra,     # texto de correção (reprovações do auditor) anexado à ordem
  [switch]$Autonomo   # o agy aprova todas as ações sozinho; só com autorização explícita do Alexandre (dada em 2026-09-19)
)
$ErrorActionPreference = 'Stop'
$raiz = Split-Path -Parent $PSScriptRoot
Set-Location $raiz

$agy = Join-Path $env:USERPROFILE '.gemini\bin\agy.exe'
if (-not (Test-Path $agy)) { throw "agy.exe não encontrado em $agy" }

$prompt = Get-ChildItem "docs\prompts\fase-$Fase-*.md" | Select-Object -First 1
if (-not $prompt) { throw "Ordem de serviço da fase $Fase não encontrada em docs\prompts" }

$branch = (git rev-parse --abbrev-ref HEAD).Trim()
if ($branch -notlike "fase/$Fase-*") { throw "Branch atual '$branch' não é fase/$Fase-*. Crie/troque antes de despachar." }
if (git status --porcelain -- . ':!docs/execucoes') { throw "Working tree suja. Commit ou stash antes." }

New-Item -ItemType Directory -Force docs\execucoes | Out-Null
$log = "docs\execucoes\fase-$Fase-agy-$(Get-Date -Format yyyyMMdd_HHmm).log"

$cabecalho = @"
Seu repositório e diretório de trabalho é: $raiz (branch $branch). Ele JÁ EXISTE e é o diretório atual: NÃO o procure em outros discos e NÃO inicie buscas ou tarefas em segundo plano.
Todos os arquivos citados na ordem existem nele (ex.: tools\probe-runtime.cjs, AGENTS.md). Trabalhe em primeiro plano até concluir TODA a ordem: se você encerrar com tarefa pendente, o trabalho é perdido.
Leia AGENTS.md e execute integralmente a ordem de serviço abaixo, incluindo a autoauditoria. Não faça push nem merge.

"@
$texto = $cabecalho + (Get-Content $prompt.FullName -Raw)
if ($Extra) { $texto += "`n`n## CORREÇÃO OBRIGATÓRIA: o auditor automático REPROVOU a sua entrega. Corrija exatamente isto, rode `npm run verify` e commite:`n$Extra`n" }
$head0 = (git rev-parse HEAD).Trim()
$env:ELECTRON_RUN_AS_NODE = $null
$argumentos = @('--print', $texto, '--effort', $Esforco, '--add-dir', $raiz)
if ($Autonomo) { $argumentos += '--dangerously-skip-permissions' } else { $argumentos += @('--mode', 'accept-edits') }
if ($Modelo) { $argumentos += @('--model', $Modelo) }

Write-Host "Despachando fase $Fase para o Antigravity (agy) na branch $branch. Log: $log"
& $agy @argumentos 2>&1 | Tee-Object -FilePath $log
if (Select-String -Path $log -Pattern 'auto-denied|permission that headless mode cannot prompt' -Quiet) {
  throw "O agy foi barrado por permissões (veja $log). Nada foi executado de fato. Use -Autonomo (com autorização) ou ajuste as regras."
}
if ((git rev-parse HEAD).Trim() -eq $head0) {
  throw "O agy terminou sem criar nenhum commit: a fase NÃO foi entregue (veja $log). Repita o despacho."
}
Write-Host "Execução terminada. Agora o chefe (Claude Code) audita: 'revisar fase $Fase'."
