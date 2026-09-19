<#
  Despacha uma fase para um executor headless, dentro da branch da fase.
  Uso: tools\despachar.ps1 -Fase 01 [-Executor gemini] [-Modelo <nome>]
  NUNCA faz push. Só roda depois do OK do Alexandre (o Gemini roda em --approval-mode yolo).
#>
param(
  [Parameter(Mandatory)][string]$Fase,
  [ValidateSet('gemini')][string]$Executor = 'gemini',
  [string]$Modelo
)
$ErrorActionPreference = 'Stop'
$raiz = Split-Path -Parent $PSScriptRoot
Set-Location $raiz

$prompt = Get-ChildItem "docs\prompts\fase-$Fase-*.md" | Select-Object -First 1
if (-not $prompt) { throw "Ordem de serviço da fase $Fase não encontrada em docs\prompts" }

$branch = (git rev-parse --abbrev-ref HEAD).Trim()
if ($branch -notlike "fase/$Fase-*") { throw "Branch atual '$branch' não é fase/$Fase-*. Crie/troque antes de despachar." }
if (git status --porcelain) { throw "Working tree suja. Commit ou stash antes." }

New-Item -ItemType Directory -Force docs\execucoes | Out-Null
$log = "docs\execucoes\fase-$Fase-$Executor-$(Get-Date -Format yyyyMMdd_HHmm).log"

$texto = "Leia AGENTS.md e execute integralmente a ordem de serviço abaixo. Não faça push.`n`n" + (Get-Content $prompt.FullName -Raw)
$args = @('-p', $texto, '--approval-mode', 'yolo')
if ($Modelo) { $args += @('-m', $Modelo) }

Write-Host "Despachando fase $Fase para $Executor na branch $branch. Log: $log"
& gemini @args 2>&1 | Tee-Object -FilePath $log
Write-Host "Execução terminada. Agora o chefe (Claude Code) audita: 'revisar fase $Fase'."
