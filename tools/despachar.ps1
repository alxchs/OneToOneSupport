<#
  Despacha uma fase para o Antigravity CLI (agy) em modo headless, dentro da branch da fase.
  Uso: tools\despachar.ps1 -Fase 01 [-Modelo <nome>] [-Esforco low|medium|high]
  NUNCA faz push. O agy roda com --mode accept-edits (edições aprovadas; demais ações seguem as permissões do próprio agy).
#>
param(
  [Parameter(Mandatory)][string]$Fase,
  [string]$Modelo,
  [ValidateSet('low','medium','high')][string]$Esforco = 'high',
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

$texto = "Leia AGENTS.md e execute integralmente a ordem de serviço abaixo. Não faça push.`n`n" + (Get-Content $prompt.FullName -Raw)
$env:ELECTRON_RUN_AS_NODE = $null
$argumentos = @('--print', $texto, '--effort', $Esforco)
if ($Autonomo) { $argumentos += '--dangerously-skip-permissions' } else { $argumentos += @('--mode', 'accept-edits') }
if ($Modelo) { $argumentos += @('--model', $Modelo) }

Write-Host "Despachando fase $Fase para o Antigravity (agy) na branch $branch. Log: $log"
& $agy @argumentos 2>&1 | Tee-Object -FilePath $log
if (Select-String -Path $log -Pattern 'auto-denied|permission that headless mode cannot prompt' -Quiet) {
  throw "O agy foi barrado por permissões (veja $log). Nada foi executado de fato. Use -Autonomo (com autorização) ou ajuste as regras."
}
Write-Host "Execução terminada. Agora o chefe (Claude Code) audita: 'revisar fase $Fase'."
