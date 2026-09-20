# Funções comuns das ferramentas do orquestrador. Uso: . "$PSScriptRoot\_comum.ps1"
$ErrorActionPreference = 'Stop'

function Get-Cfg {
  $raiz = Split-Path -Parent $PSScriptRoot
  $c = $null
  $arq = Join-Path $raiz 'orquestrador.config.json'
  if (Test-Path $arq) { $c = Get-Content $arq -Raw | ConvertFrom-Json }
  function V($v, $d) { if ($null -ne $v -and "$v" -ne '') { return $v } else { return $d } }
  $red = $c.redTeam
  [pscustomobject]@{
    Raiz           = $raiz
    BaseBranch     = V $c.baseBranch 'main'
    BranchPrefix   = V $c.branchPrefix 'fase'
    PromptsDir     = V $c.promptsDir 'docs/prompts'
    AgyPath        = [Environment]::ExpandEnvironmentVariables((V $c.agy.path '%USERPROFILE%\.gemini\bin\agy.exe'))
    Effort         = V $c.agy.effort 'high'
    RedTeam        = if ($null -ne $red -and $null -ne $red.enabled) { [bool]$red.enabled } else { $true }
    RedTeamTestDir = V $red.testDir 'tests/adversarial'
    RedTeamAllowed = @(V $red.allowedPaths @('tests/adversarial/', 'docs/reviews/redteam-'))
    TestCmd        = V $red.testCmd 'o comando de testes do projeto (veja package.json)'
  }
}

function New-Cabecalho($cfg, $branch) {
@"
Seu repositório e diretório de trabalho é: $($cfg.Raiz) (branch $branch). Ele JÁ EXISTE e é o diretório atual: NÃO o procure em outros discos e NÃO inicie buscas ou tarefas em segundo plano.
REGRA CRÍTICA DE EXECUÇÃO: seu processo ENCERRA quando você termina uma resposta sem chamar ferramenta. Se um comando longo (instalação, testes, build) for para segundo plano, NUNCA escreva "aguardando" e pare: continue chamando ferramentas em sequência (ex.: Start-Sleep 20 e ler a saída) até ele terminar, dentro da mesma execução. Só termine depois de commitar TUDO.
Não faça push nem merge. NÃO INVENTE: todo nome (evento, arquivo, função, branch, script, comando) que você citar em documentação precisa existir no código; o verificador de afirmações confere. Não afirme nada que você não executou.

"@
}

function Invoke-Agy {
  param($Cfg, [string]$Texto, [string]$Log, [switch]$Autonomo, [string]$Modelo, [switch]$DryRun)
  if ($DryRun) {
    $modo = if ($Autonomo) { ' --dangerously-skip-permissions' } else { ' --mode accept-edits' }
    Write-Host "[DRY-RUN] agy --print <$($Texto.Length) caracteres> --effort $($Cfg.Effort) --add-dir $($Cfg.Raiz)$modo"
    Set-Content -Path $Log -Value $Texto -Encoding utf8   # o prompt COMPLETO fica no log para conferência
    Write-Host "[DRY-RUN] prompt completo gravado em $Log"
    return
  }
  if (-not (Test-Path $Cfg.AgyPath)) { throw "agy não encontrado em $($Cfg.AgyPath) (ajuste agy.path em orquestrador.config.json)" }
  $env:ELECTRON_RUN_AS_NODE = $null
  $a = @('--print', $Texto, '--effort', $Cfg.Effort, '--add-dir', $Cfg.Raiz)
  if ($Autonomo) { $a += '--dangerously-skip-permissions' } else { $a += @('--mode', 'accept-edits') }
  if ($Modelo) { $a += @('--model', $Modelo) }
  & $Cfg.AgyPath @a 2>&1 | Tee-Object -FilePath $Log
  if (Select-String -Path $Log -Pattern 'auto-denied|permission that headless mode cannot prompt' -Quiet) {
    throw "O agy foi barrado por permissões (veja $Log). Nada foi executado de fato. Use -Autonomo (com autorização do dono) ou ajuste as regras do agy."
  }
}

function Test-ArvoreLimpa($ignorar) {
  $spec = @('.') + @($ignorar | ForEach-Object { ":!$_" })
  return -not (git status --porcelain -- @spec)
}

function Get-PromptFase($cfg, $fase) {
  $dir = Join-Path $cfg.Raiz $cfg.PromptsDir
  Get-ChildItem $dir -Filter "fase-$fase-*.md" -ErrorAction SilentlyContinue | Where-Object { $_.Name -notlike '_*' } | Select-Object -First 1
}

function Get-BranchFase($cfg, $fase) {
  $p = Get-PromptFase $cfg $fase
  if (-not $p) { return $null }
  return "$($cfg.BranchPrefix)/$fase-" + ($p.BaseName -replace '^fase-\d+-', '')
}

# Arquivos alterados (commitados desde $preHead, modificados ou novos) fora dos prefixos permitidos.
function Get-AlteracoesForaDoPermitido($preHead, $permitidos) {
  $ok = @($permitidos) + @('docs/execucoes/')
  $arqs = @(git diff --name-only $preHead HEAD) + @(git status --porcelain -uall | ForEach-Object { $_.Substring(3).Trim('"') })
  $arqs | Where-Object { $_ } | Sort-Object -Unique | Where-Object { $f = $_; -not ($ok | Where-Object { $f.StartsWith($_) }) }
}
