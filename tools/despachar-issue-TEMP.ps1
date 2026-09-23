param([Parameter(Mandatory)][string]$IssueDir, [switch]$Autonomo)
. "$PSScriptRoot\_comum.ps1"
$cfg = Get-Cfg
Set-Location $cfg.Raiz
$branch = (git rev-parse --abbrev-ref HEAD).Trim()
$ordemPath = Join-Path $cfg.Raiz "$IssueDir\ordem-correcao.md"
if (-not (Test-Path $ordemPath)) { throw "Nao encontrada: $ordemPath" }

New-Item -ItemType Directory -Force docs\execucoes | Out-Null
$log = "docs\execucoes\issue-investigacao-mouseup-agy-$(Get-Date -Format yyyyMMdd_HHmm).log"
$texto = (New-Cabecalho $cfg $branch) + "Leia AGENTS.md e execute integralmente a ordem de servico abaixo (e a autoauditoria, se pedida nela).`n`n" + (Get-Content $ordemPath -Raw)

Write-Host "Despachando $IssueDir para o Antigravity (agy) na branch $branch. Log: $log"
Invoke-Agy -Cfg $cfg -Texto $texto -Log $log -Autonomo:$Autonomo
Write-Host "Execucao terminada."
