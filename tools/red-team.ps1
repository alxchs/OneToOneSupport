<#
  Red team: outra passada do executor (agy) com o papel de ATACANTE. Ele só pode criar testes adversariais e um relatório;
  qualquer alteração fora dos caminhos permitidos é DESCARTADA (reset ao commit anterior) e o script falha.
  Uso: tools\red-team.ps1 -Fase 01 -Autonomo [-DryRun]
  Testes que expõem falha real são commitados FALHANDO: eles derrubam o verify e o lote manda o implementador corrigir o código.
#>
param([Parameter(Mandatory)][string]$Fase, [string]$Modelo, [switch]$Autonomo, [switch]$DryRun)
. "$PSScriptRoot\_comum.ps1"
$cfg = Get-Cfg
Set-Location $cfg.Raiz
$Fase = $Fase.PadLeft(2, '0')

$branch = (git rev-parse --abbrev-ref HEAD).Trim()
if ($branch -notlike "$($cfg.BranchPrefix)/$Fase-*") { throw "Branch atual '$branch' não é $($cfg.BranchPrefix)/$Fase-*." }
if (-not (Test-ArvoreLimpa @('docs/execucoes', '.gitignore'))) { throw "Working tree suja. Commit ou stash antes." }
if (-not $Autonomo -and -not $DryRun) { throw "O red team precisa de -Autonomo (o headless não pede permissão nem para ler arquivos). Exige autorização do dono." }
$modelo = Join-Path $cfg.Raiz "$($cfg.PromptsDir)/_red-team.md"
if (-not (Test-Path $modelo)) { throw "Modelo não encontrado: $modelo" }
$ordem = Get-PromptFase $cfg $Fase

$corpo = (Get-Content $modelo -Raw).Replace('{{FASE}}', $Fase).Replace('{{ORDEM}}', $(if ($ordem) { "$($cfg.PromptsDir)/$($ordem.Name)" } else { '(sem ordem)' })).Replace('{{BASE}}', $cfg.BaseBranch).Replace('{{TESTDIR}}', $cfg.RedTeamTestDir).Replace('{{TESTCMD}}', $cfg.TestCmd)
$texto = (New-Cabecalho $cfg $branch) + $corpo
New-Item -ItemType Directory -Force docs\execucoes | Out-Null
$log = "docs\execucoes\redteam-$Fase-agy-$(Get-Date -Format yyyyMMdd_HHmm).log"
$pre = (git rev-parse HEAD).Trim()

Write-Host "Red team da fase $Fase na branch $branch. Log: $log"
Invoke-Agy -Cfg $cfg -Texto $texto -Log $log -Autonomo:$Autonomo -Modelo $Modelo -DryRun:$DryRun
if ($DryRun) { return }

$viol = @(Get-AlteracoesForaDoPermitido $pre $cfg.RedTeamAllowed)
if ($viol.Count -gt 0) {
  Write-Host "O red team alterou arquivos FORA do permitido; descartando tudo:`n  $($viol -join "`n  ")"
  git reset --hard $pre | Out-Null
  foreach ($v in $viol) { if ((Test-Path $v) -and -not (git ls-files -- $v)) { Remove-Item -Recurse -Force $v } }
  throw "Red team violou o escopo (só tests adversariais e docs/reviews/redteam-*). Entrega descartada."
}
if ((git rev-parse HEAD).Trim() -eq $pre) { throw "O red team terminou sem criar commit (veja $log)." }
Write-Host "Red team entregue. Se houver testes falhando, são vulnerabilidades reais: o lote manda o implementador corrigir."
