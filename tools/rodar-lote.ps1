<#
  Roda VÁRIAS fases em sequência, sem você no meio. Cada fase = uma branch (fase/NN-slug), empilhadas:
  a branch da fase seguinte nasce da anterior. Entre uma fase e outra roda o auditor automático (tools\auditar.cjs);
  se reprovar, o Antigravity é mandado corrigir (até -Tentativas vezes). Só para se continuar reprovando.
  Uso: pwsh -NoProfile -File tools\rodar-lote.ps1 -Fases 02,03,04
  NUNCA faz merge nem push.
#>
param([Parameter(Mandatory)][string[]]$Fases, [int]$Tentativas = 2)
$ErrorActionPreference = 'Stop'
$raiz = Split-Path -Parent $PSScriptRoot
Set-Location $raiz
New-Item -ItemType Directory -Force docs\execucoes | Out-Null
$resumo = "docs\execucoes\lote-$(Get-Date -Format yyyyMMdd_HHmm).log"
function Registra($t) { Write-Host $t; Add-Content $resumo $t }

$Fases = @($Fases | ForEach-Object { $_ -split "[,; ]+" } | Where-Object { $_ })  # com -File, "02,03,04" chega como um texto só
foreach ($f in $Fases) {
  $f = $f.PadLeft(2, '0')
  $p = Get-ChildItem "docs\prompts\fase-$f-*.md" | Select-Object -First 1
  if (-not $p) { throw "Sem ordem de serviço para a fase $f" }
  $branch = "fase/$f-" + ($p.BaseName -replace '^fase-\d+-', '')
  if (git branch --list $branch) { git switch -q $branch } else { git switch -q -c $branch }
  Registra "=== FASE $f | branch $branch | $(Get-Date -Format HH:mm:ss)"

  $extra = $null
  for ($i = 0; $i -le $Tentativas; $i++) {
    try {
      if ($extra) { & "$PSScriptRoot\despachar.ps1" -Fase $f -Autonomo -Extra $extra }
      else        { & "$PSScriptRoot\despachar.ps1" -Fase $f -Autonomo }
    } catch { Registra "  despacho falhou: $($_.Exception.Message)"; if ($i -eq $Tentativas) { Registra "PAROU na fase $f (despacho)."; exit 1 } ; continue }

    $saida = (& node tools\auditar.cjs $branch 2>&1 | Out-String)
    Set-Content "docs\execucoes\auditoria-fase-$f.log" $saida
    if ($LASTEXITCODE -eq 0) { Registra "  auditor automático: TUDO VERDE (tentativa $($i + 1))"; break }
    $reprov = ($saida -split "`n" | Where-Object { $_ -match '^FAIL' }) -join "`n"
    Registra "  auditor automático REPROVOU (tentativa $($i + 1)):`n$reprov"
    if ($i -eq $Tentativas) { Registra "PAROU na fase ${f}: continua reprovada após $Tentativas correções. Veja docs\execucoes\auditoria-fase-$f.log"; exit 1 }
    $extra = $reprov
  }
}
Registra "LOTE CONCLUÍDO: fases $($Fases -join ', ') entregues e com auditor automático verde. Resumo: $resumo"
Registra "Agora avise o chefe (Claude Code) numa sessão limpa: 'lote terminou'."
