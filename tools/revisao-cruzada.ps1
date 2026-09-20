<#
  Revisão cruzada: o executor (agy) revisa, SEM alterar nada, os artefatos escritos pelo chefe (ordem de serviço, ferramentas, regras).
  Uso: tools\revisao-cruzada.ps1 -Fase 02 -Autonomo
  Saída: docs\reviews\revisao-cruzada-NN.md (escrito por este script). Confere no fim que o agente não alterou NENHUM arquivo.
#>
param([Parameter(Mandatory)][string]$Fase, [switch]$Autonomo)
. "$PSScriptRoot\_comum.ps1"
$cfg = Get-Cfg
Set-Location $cfg.Raiz
$Fase = $Fase.PadLeft(2, '0')
$saida = "docs/reviews/revisao-cruzada-$Fase.md"
if (-not $Autonomo) { throw "A revisão cruzada precisa de -Autonomo (headless não lê arquivos sem permissão). Exige autorização do dono." }
if (-not (Test-ArvoreLimpa @('docs/execucoes', '.gitignore', $saida))) { throw "Working tree suja; commit antes." }
$pre = (git rev-parse HEAD).Trim()
$texto = (New-Cabecalho $cfg (git rev-parse --abbrev-ref HEAD).Trim()) + @"
MODO SOMENTE LEITURA ABSOLUTO: não edite, não crie, não apague arquivos; não rode git commit/add/checkout/reset; não instale nada. Só leia.
Revise criticamente estes artefatos, escritos por outra IA (o chefe técnico), e aponte LACUNAS REAIS: $($cfg.PromptsDir)/fase-$Fase-*.md, tools/*.cjs, tools/*.ps1 e a seção de autoauditoria do AGENTS.md.
Procure: ambiguidades que fariam um executor errar; requisitos sem critério de aceite verificável; bugs nas ferramentas; casos que o auditor automático não detectaria; riscos de segurança.
Responda em português, no máximo 25 linhas, lista numerada por gravidade, cada item com arquivo e motivo concreto. Sem elogios.
"@
$log = "docs\execucoes\revisao-cruzada-$Fase-$(Get-Date -Format yyyyMMdd_HHmm).log"
New-Item -ItemType Directory -Force docs\execucoes | Out-Null
$r = & { Invoke-Agy -Cfg $cfg -Texto $texto -Log $log -Autonomo }  | Out-String
$viol = @(Get-AlteracoesForaDoPermitido $pre @($saida))
if ($viol.Count -gt 0) { throw "O agente ALTEROU arquivos numa revisão somente leitura: $($viol -join ', '). Confira com git status e descarte." }
if ([string]::IsNullOrWhiteSpace($r)) { throw "Revisão sem conteúdo utilizável (veja $log)." }
New-Item -ItemType Directory -Force docs\reviews | Out-Null
"# Revisão cruzada (executor revisando o chefe) — fase $Fase`n`n$r" | Set-Content $saida -Encoding utf8
Write-Host "Revisão salva em $saida."
