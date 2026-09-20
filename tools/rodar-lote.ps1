<#
  Roda VÁRIAS fases em sequência, sem o dono no meio. Cada fase = uma branch (<prefixo>/NN-slug), empilhadas.
  Por fase: implementador -> auditor automático -> (se verde) red team -> auditor -> correções automáticas (até -Tentativas)
  se algo reprovar. Só para se continuar reprovando. NUNCA faz merge nem push.
  Uso: pwsh -NoProfile -File tools\rodar-lote.ps1 -Fases 02,03,04 [-SemRedTeam] [-Tentativas 2] [-DryRun]
  Dica: rode numa janela independente do editor:
    Start-Process pwsh -WorkingDirectory <projeto> -ArgumentList '-NoExit','-NoProfile','-File','<projeto>\tools\rodar-lote.ps1','-Fases','02,03'
#>
param([Parameter(Mandatory)][string[]]$Fases, [int]$Tentativas = 2, [switch]$SemRedTeam, [switch]$DryRun)
. "$PSScriptRoot\_comum.ps1"
$cfg = Get-Cfg
Set-Location $cfg.Raiz
$Fases = @($Fases | ForEach-Object { $_ -split '[,; ]+' } | Where-Object { $_ })   # com -File, "02,03,04" chega como um texto só
$usaRed = $cfg.RedTeam -and -not $SemRedTeam
New-Item -ItemType Directory -Force docs\execucoes | Out-Null
$resumo = "docs\execucoes\lote-$(Get-Date -Format yyyyMMdd_HHmm).log"
function Registra($t) { Write-Host $t; Add-Content $resumo $t }
function Audita($branch, $f) {
  $saida = (& node tools\auditar.cjs $branch 2>&1 | Out-String)
  $ok = ($LASTEXITCODE -eq 0)
  Set-Content "docs\execucoes\auditoria-fase-$f.log" $saida
  return @{ Ok = $ok; Saida = $saida; Reprov = (($saida -split "`n" | Where-Object { $_ -match '^FAIL' }) -join "`n") }
}

foreach ($f in $Fases) {
  $f = $f.PadLeft(2, '0')
  $branch = Get-BranchFase $cfg $f
  if (-not $branch) { throw "Sem ordem de serviço para a fase $f em $($cfg.PromptsDir)" }
  if (git branch --list $branch) { git switch -q $branch } else { git switch -q -c $branch }
  Registra "=== FASE $f | branch $branch | $(Get-Date -Format HH:mm:ss)"

  # Fase já entregue (a ponta difere da fase anterior/base)? Então audita primeiro, sem refazer.
  $ant = (git branch --list ("{0}/{1:d2}-*" -f $cfg.BranchPrefix, ([int]$f - 1)) | Select-Object -First 1)
  $base = if ($ant) { $ant.Trim().TrimStart('*').Trim() } else { $cfg.BaseBranch }
  $pular = (git rev-parse $branch).Trim() -ne (git rev-parse $base).Trim()
  if ($pular) { Registra "  fase $f já tem entrega na branch: auditando antes de qualquer novo despacho" }

  $extra = $null; $fix = 0; $redHead = $null
  $redFeito = (-not $usaRed) -or (Test-Path "docs\reviews\redteam-$f.md")
  while ($true) {
    if ($pular) { $pular = $false } else {
      try {
        if ($extra) { & "$PSScriptRoot\despachar.ps1" -Fase $f -Autonomo -Extra $extra -DryRun:$DryRun }
        else        { & "$PSScriptRoot\despachar.ps1" -Fase $f -Autonomo -DryRun:$DryRun }
      } catch {
        Registra "  despacho falhou: $($_.Exception.Message)"
        $fix++; if ($fix -gt $Tentativas) { Registra "PAROU na fase $f (despacho)."; exit 1 }
        continue
      }
      if ($redHead) {   # o implementador não pode enfraquecer os testes do red team
        $mod = @(git diff --name-only $redHead HEAD -- $cfg.RedTeamTestDir)
        if ($mod.Count -gt 0) {
          Registra "  implementador alterou testes do red team ($($mod -join ', ')): restaurando"
          git checkout $redHead -- $cfg.RedTeamTestDir
          git commit -q -m "Restaura testes adversariais alterados pelo implementador"
        }
      }
    }
    $r = Audita $branch $f
    if ($DryRun) { Registra "  [dry-run] auditor: $(if ($r.Ok) { 'verde' } else { 'reprovou' }); encerrando esta fase sem correções"; break }
    if ($r.Ok) {
      if (-not $redFeito) {
        $redFeito = $true; $pular = $true
        try { & "$PSScriptRoot\red-team.ps1" -Fase $f -Autonomo; $redHead = (git rev-parse HEAD).Trim(); Registra "  red team entregue; reauditando" }
        catch { Registra "  red team falhou (a fase segue sem ele): $($_.Exception.Message)" }
        continue
      }
      Registra "  auditor automático: TUDO VERDE"; break
    }
    Registra "  auditor automático REPROVOU:`n$($r.Reprov)"
    $fix++
    if ($fix -gt $Tentativas) { Registra "PAROU na fase ${f}: continua reprovada após $Tentativas correções. Veja docs\execucoes\auditoria-fase-$f.log"; exit 1 }
    $extra = "REPROVAÇÕES:`n$($r.Reprov)`n`nO auditor JÁ rodou clone limpo, instalação, verificação e checagens; a evidência completa está abaixo. NÃO rode instalação/verify/clone limpo de novo (são longos e encerram a sua execução). Corrija SOMENTE as reprovações, commite e termine. Se as reprovações incluem testes em $($cfg.RedTeamTestDir): são vulnerabilidades REAIS na implementação; corrija o código de produção e NUNCA edite, remova ou enfraqueça esses testes.`n`nEVIDÊNCIA DO AUDITOR:`n$($r.Saida)"
  }
}
Registra "LOTE CONCLUÍDO: fases $($Fases -join ', ') entregues e com auditor automático verde. Resumo: $resumo"
Registra "Agora avise o chefe numa sessão limpa: 'lote terminou'."
