<#
  Revisão cruzada: o Antigravity (agy) revisa, SEM alterar nada, artefatos escritos pelo chefe (Claude Code).
  Uso: tools\revisao-cruzada.ps1 -Fase 02
  Saída: docs\reviews\revisao-cruzada-NN.md (escrito por este script, não pelo agente).
  Precisa de --dangerously-skip-permissions (o headless não consegue pedir permissão nem para ler arquivos);
  por isso o script confere, ao final, que o agente não alterou NENHUM arquivo rastreado ou novo.
#>
param([Parameter(Mandatory)][string]$Fase)
$ErrorActionPreference = 'Stop'
$raiz = Split-Path -Parent $PSScriptRoot
Set-Location $raiz
$agy = Join-Path $env:USERPROFILE '.gemini\bin\agy.exe'
$saida = "docs\reviews\revisao-cruzada-$Fase.md"
$ignorar = @($saida.Replace('\','/'), 'docs/execucoes')
function Estado { (git status --porcelain) | Where-Object { $l = $_; -not ($ignorar | Where-Object { $l -like "*$_*" }) } }
if (Estado) { throw "Working tree suja; commit antes de rodar a revisão cruzada." }

$p = @"
Seu repositório e diretório de trabalho é $raiz (já existe; NÃO o procure em outros discos; NÃO use tarefas em segundo plano).
MODO SOMENTE LEITURA ABSOLUTO: não edite, não crie, não apague arquivos; não rode git commit/add/checkout/reset; não instale nada. Só leia.
Revise criticamente estes artefatos, escritos por outra IA (o chefe técnico), e aponte LACUNAS REAIS:
docs/prompts/fase-$Fase-*.md, tools/auditar.cjs, tools/probe-runtime.cjs, tools/despachar.ps1 e a seção 'Autoauditoria obrigatória' do AGENTS.md.
Procure: ambiguidades que fariam um executor errar; requisitos sem critério de aceite verificável; bugs nas ferramentas; casos que o auditor automático não detectaria; riscos de segurança; contradições com docs/DOCUMENTO_MESTRE.md.
Responda em português, no máximo 25 linhas, lista numerada por gravidade, cada item com arquivo e motivo concreto. Sem elogios.
"@
$env:ELECTRON_RUN_AS_NODE = $null
$r = & $agy --print $p --effort high --add-dir $raiz --dangerously-skip-permissions 2>&1 | Out-String
if (Estado) { throw "O agente ALTEROU arquivos durante uma revisão somente leitura. Confira com git status e descarte (git restore .; git clean -fd -e docs/execucoes)." }
if ([string]::IsNullOrWhiteSpace($r) -or $r -match 'auto-denied') { throw "Revisão sem conteúdo utilizável:`n$r" }
New-Item -ItemType Directory -Force docs\reviews | Out-Null
"# Revisão cruzada (Antigravity revisando o chefe) — fase $Fase`n`n$r" | Set-Content $saida -Encoding utf8
Write-Host "Revisão salva em $saida. Avise o chefe (Claude Code)."
