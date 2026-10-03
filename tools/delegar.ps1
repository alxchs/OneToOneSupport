<#
  Delega ao agy qualquer ordem que não seja a de uma fase: Issue, correção, auditoria-sombra, ordem escrita pela
  própria AGY, tarefa de aprendizado. (Fase continua sendo tools\despachar.ps1.)
  Uso: tools\delegar.ps1 -Ordem <arquivo.md> -Nome <slug> [-Modelo <id>] [-Dir <repo>] [-Papel executor|auditor|chefe]
                         [-Permitidos <prefixos>] [-ExigirCommit] [-Autonomo] [-DryRun]
  -Papel auditor/chefe = tudo fora de -Permitidos é proibido de mudar (conferido no fim por git, não por confiança).
  -Dir = outro clone (ex.: clone higienizado de prova). O log fica sempre em docs\execucoes deste repositório.
  NUNCA faz push nem merge.
#>
param([Parameter(Mandatory)][string]$Ordem, [Parameter(Mandatory)][string]$Nome, [string]$Modelo, [string]$Dir,
  [ValidateSet('executor', 'auditor', 'chefe')][string]$Papel = 'executor', [string[]]$Permitidos = @(),
  [switch]$ExigirCommit, [switch]$Autonomo, [switch]$DryRun)
. "$PSScriptRoot\_comum.ps1"
$cfg = Get-Cfg
# Via "pwsh -File", 'a','b' chega como UM texto só: separa por vírgula e tira as aspas.
$Permitidos = @($Permitidos | ForEach-Object { $_ -split ',' } | ForEach-Object { $_.Trim().Trim("'", '"') } | Where-Object { $_ })
if (-not $Dir) { $Dir = $cfg.Raiz }
$Dir = (Resolve-Path $Dir).Path
$Ordem = (Resolve-Path $Ordem).Path
New-Item -ItemType Directory -Force (Join-Path $cfg.Raiz 'docs\execucoes') | Out-Null
$log = Join-Path $cfg.Raiz "docs\execucoes\$Nome-agy-$(Get-Date -Format yyyyMMdd_HHmm).log"

Push-Location $Dir
try {
  $branch = (git rev-parse --abbrev-ref HEAD).Trim()
  if (-not (Test-ArvoreLimpa (@('docs/execucoes', '.gitignore') + $Permitidos))) { throw "Working tree suja em $Dir. Commit ou stash antes." }
  $pre = (git rev-parse HEAD).Trim()
  $cfgDir = $cfg.PSObject.Copy(); $cfgDir.Raiz = $Dir
  $papelTxt = switch ($Papel) {
    'executor' { "Seu papel: EXECUTOR. Implemente a ordem abaixo e faça a autoauditoria do AGENTS.md.`n" }
    'auditor' { "Seu papel: AUDITOR (somente leitura no código). Você só pode criar/alterar: $($Permitidos -join ', '). Não commite. Testes de ataque que você escrever ficam dentro desses caminhos.`n" }
    'chefe' { "Seu papel: CHEFE TÉCNICO EM TREINAMENTO. Siga a skill .agents/skills/chefe-tecnico (se existir) e o docs/CHEFE.md. Você só pode criar/alterar: $($Permitidos -join ', ').`n" }
  }
  $texto = (New-Cabecalho $cfgDir $branch -SemCommit:($Papel -eq 'auditor')) + $papelTxt + "Leia AGENTS.md e docs/LICOES.md (se existir) antes de começar e execute integralmente a ordem abaixo.`n`n" + (Get-Content $Ordem -Raw)
  Write-Host "Delegando '$Nome' ($Papel, modelo: $(if ($Modelo) { $Modelo } else { 'padrão' })) em $Dir [$branch]. Log: $log"
  Invoke-Agy -Cfg $cfg -Texto $texto -Log $log -Autonomo:$Autonomo -Modelo $Modelo -DryRun:$DryRun -Dir $Dir
  if ($DryRun) { return }
  if ($Papel -ne 'executor') {
    $viol = @(Get-AlteracoesForaDoPermitido $pre $Permitidos)
    if ($viol.Count -gt 0) { throw "Papel '$Papel' ALTEROU arquivos fora do permitido: $($viol -join ', '). Confira com git status em $Dir." }
  }
  if ($ExigirCommit -and (git rev-parse HEAD).Trim() -eq $pre) { throw "O agy terminou sem commit: a ordem NÃO foi entregue (veja $log)." }
  Write-Host "Terminado. Log: $log"
} finally { Pop-Location }
