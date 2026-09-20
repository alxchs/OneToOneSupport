<#
  Despacha uma fase para o executor (Antigravity CLI: agy, modo headless), dentro da branch da fase.
  Uso: tools\despachar.ps1 -Fase 01 [-Autonomo] [-Modelo <nome>] [-Extra "<texto de correção>"] [-DryRun]
  -Autonomo = o agy aprova todas as ações sozinho (--dangerously-skip-permissions): só com autorização explícita do dono.
  Sem -Autonomo o agy roda em accept-edits e o headless costuma ser barrado ao rodar comandos.
  NUNCA faz push nem merge. Falha (erro) se o agy terminar sem criar nenhum commit.
#>
param([Parameter(Mandatory)][string]$Fase, [string]$Modelo, [string]$Extra, [switch]$Autonomo, [switch]$DryRun)
. "$PSScriptRoot\_comum.ps1"
$cfg = Get-Cfg
Set-Location $cfg.Raiz
$Fase = $Fase.PadLeft(2, '0')

$prompt = Get-PromptFase $cfg $Fase
if (-not $prompt) { throw "Ordem de serviço da fase $Fase não encontrada em $($cfg.PromptsDir) (esperado: fase-$Fase-<slug>.md)" }
$branch = (git rev-parse --abbrev-ref HEAD).Trim()
if ($branch -notlike "$($cfg.BranchPrefix)/$Fase-*") { throw "Branch atual '$branch' não é $($cfg.BranchPrefix)/$Fase-*. Crie/troque antes de despachar." }
if (-not (Test-ArvoreLimpa @('docs/execucoes', '.gitignore'))) { throw "Working tree suja. Commit ou stash antes." }

New-Item -ItemType Directory -Force docs\execucoes | Out-Null
$log = "docs\execucoes\fase-$Fase-agy-$(Get-Date -Format yyyyMMdd_HHmm).log"
$texto = (New-Cabecalho $cfg $branch) + "Leia AGENTS.md e execute integralmente a ordem de serviço abaixo, incluindo a autoauditoria.`n`n" + (Get-Content $prompt.FullName -Raw)
if ($Extra) { $texto += "`n`n## CORREÇÃO OBRIGATÓRIA: o auditor automático REPROVOU a sua entrega. Corrija exatamente isto, rode a verificação do projeto e commite:`n$Extra`n" }
$head0 = (git rev-parse HEAD).Trim()

Write-Host "Despachando fase $Fase para o Antigravity (agy) na branch $branch. Log: $log"
Invoke-Agy -Cfg $cfg -Texto $texto -Log $log -Autonomo:$Autonomo -Modelo $Modelo -DryRun:$DryRun
if ($DryRun) { return }
if ((git rev-parse HEAD).Trim() -eq $head0) { throw "O agy terminou sem criar nenhum commit: a fase NÃO foi entregue (veja $log). Repita o despacho." }
Write-Host "Execução terminada. Agora o chefe audita: node tools\auditar.cjs"
