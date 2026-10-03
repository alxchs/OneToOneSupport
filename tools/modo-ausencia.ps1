param(
    [string[]]$Itens = @(),
    [int]$MaxRodadas = 3,
    [switch]$Autonomo,
    [switch]$DryRun,
    [switch]$TestExport
)

. "$PSScriptRoot\_comum.ps1"

function Parse-Veredito {
    param([string]$FilePath)
    if (-not (Test-Path $FilePath)) {
        return @{ Status = 'REJEITADA'; Motivo = 'Arquivo ausente'; Lixo = $true }
    }
    $lines = @(Get-Content $FilePath)
    if ($lines.Count -eq 0 -or ($lines.Count -eq 1 -and [string]::IsNullOrWhiteSpace($lines[0]))) {
        return @{ Status = 'REJEITADA'; Motivo = 'Arquivo vazio'; Lixo = $true }
    }
    
    $primeiraLinha = $lines[0].Trim()
    
    if ($primeiraLinha -match '(?i)^Veredito:\s*APROVADA$') {
        return @{ Status = 'APROVADA'; Motivo = ''; Lixo = $false }
    } elseif ($primeiraLinha -match '(?i)^Veredito:\s*REJEITADA$') {
        $motivo = ($lines | Select-Object -Skip 1) -join "`n"
        $lixo = $false
        if (-not ($motivo -match '(?s)###\s*D\d+.*?(```|`$+)')) {
            $lixo = $true
        }
        return @{ Status = 'REJEITADA'; Motivo = $motivo; Lixo = $lixo }
    } else {
        return @{ Status = 'REJEITADA'; Motivo = 'Primeira linha fora do padrao'; Lixo = $true }
    }
}

function Test-Parada {
    param($Resultado, $UltimaRejeicao)
    if ($Resultado.Status -eq 'APROVADA') { return 'APROVADA' }
    if ($Resultado.Lixo -or (-not ($Resultado.Motivo -match '(?s)###\s*D\d+.*?(```|`$+)'))) { return 'ESCALADO_SEM_PROVA' }
    if ($UltimaRejeicao -ne "" -and $UltimaRejeicao -eq $Resultado.Motivo) { return 'ESCALADO' }
    return 'NOVA_RODADA'
}

function Ler-Fila {
    if (-not (Test-Path docs/FILA.md)) { return @() }
    $linhas = Get-Content docs/FILA.md
    $fila = @()
    foreach ($l in $linhas) {
        if ($l -match '^\|\s*(B\d+)\s*\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|\s*(\d+)\s*\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|$') {
            $fila += [pscustomobject]@{
                ID = $Matches[1].Trim()
                Branch = $Matches[2].Trim()
                Status = $Matches[3].Trim()
                Rodadas = [int]$Matches[4].Trim()
                Veredito = $Matches[5].Trim()
                Decisao = $Matches[6].Trim()
                Cota = $Matches[7].Trim()
            }
        }
    }
    return $fila
}

function Salvar-Fila {
    param($Fila)
    $texto = @"
# Fila do Modo Ausência

| ID | Branch | Status | Rodadas | Veredito | Decisão do Dono | Cota |
|---|---|---|---|---|---|---|
"@
    foreach ($item in $Fila) {
        $texto += "`n| $($item.ID) | $($item.Branch) | $($item.Status) | $($item.Rodadas) | $($item.Veredito) | $($item.Decisao) | $($item.Cota) |"
    }
    Set-Content -Path docs/FILA.md -Value $texto -Encoding utf8
}

if ($TestExport) { return }

$filaTotal = Ler-Fila
$ItensArray = $Itens | ForEach-Object { $_ -split ',' } | ForEach-Object { $_.Trim() } | Where-Object { $_ }
$filaProcessar = $filaTotal
if ($ItensArray.Count -gt 0) {
    $filaProcessar = $filaTotal | Where-Object { $ItensArray -contains $_.ID }
}

$consecutiveEscalados = 0

foreach ($item in $filaProcessar) {
    if ($item.Status -eq 'PRONTA-PARA-REVISAO' -or $item.Status -eq 'ESCALADO' -or $item.Status -eq 'BLOQUEADA') {
        continue
    }

    Write-Host "Processando item $($item.ID)"
    
    if (-not $DryRun) {
        Write-Host "Rodando npm run verify..."
        cmd /c "npm run verify"
        if ($LASTEXITCODE -ne 0) {
            Write-Host "Parada obrigatória: npm run verify falhou antes do item."
            break
        }
    }

    $promptPath = "docs/prompts/backlog/$($item.ID).md"
    $promptText = ""
    if (Test-Path $promptPath) {
        $promptText = Get-Content $promptPath -Raw
    }
    
    $proibidos = @("git p" + "ush", "merge em m" + "ain", "apagar br" + "anch", "--fo" + "rce", "reset --h" + "ard")
    $temProibido = $false
    foreach ($p in $proibidos) {
        if ($promptText -match $p) {
            $temProibido = $true
            break
        }
    }
    
    if ($temProibido) {
        Write-Host "Parada obrigatória: Item $($item.ID) pede algo da coluna Nunca."
        break
    }

    $branch = $item.Branch
    if (-not $DryRun) {
        ia claim agy "$($item.ID)"
        try {
            git checkout main
            if (git branch --list $branch) {
                git checkout $branch
            } else {
                git checkout -b $branch
            }
        } catch {
            Write-Host "Falha ao preparar branch $branch"
            ia release agy
            break
        }
    } else {
        Write-Host "[DRY-RUN] ia claim agy $($item.ID)"
        Write-Host "[DRY-RUN] git checkout main; git checkout ou branch $branch"
    }

    $ultimaRejeicao = ""

    while ($item.Rodadas -lt $MaxRodadas) {
        $item.Rodadas += 1
        
        $ordem = $promptPath
        if (-not $DryRun) {
            if ($item.Rodadas -gt 1) {
                $promptRejeicaoPath = "docs/prompts/backlog/tmp-exec-$($item.ID).md"
                $novoTexto = $promptText + "`n`n## CORREÇÃO OBRIGATÓRIA`nO auditor automático REPROVOU a sua entrega. Corrija os seguintes defeitos e não se esqueça de preencher a autoauditoria com o diff real:`n" + $ultimaRejeicao
                Set-Content -Path $promptRejeicaoPath -Value $novoTexto -Encoding utf8
                $ordem = $promptRejeicaoPath
            }
            
            $modelosExecutor = @($null, "flash")
            $executorSuccess = $false
            foreach ($m in $modelosExecutor) {
                try {
                    $cmd = "pwsh -File tools/delegar.ps1 -Ordem `"$ordem`" -Nome `"exec-$($item.ID)-r$($item.Rodadas)`" -Papel executor -ExigirCommit -Autonomo:$Autonomo"
                    if ($m) { $cmd += " -Modelo $m" }
                    Invoke-Expression $cmd
                    $executorSuccess = $true
                    break
                } catch {
                    if ($_ -match '429') {
                        Write-Host "Cota 429 no executor (modelo $($m))."
                        continue
                    } else {
                        ia release agy
                        throw $_
                    }
                }
            }
            
            if (-not $executorSuccess) {
                $item.Status = 'BLOQUEADA'
                $item.Cota = "Atingida"
                Salvar-Fila $filaTotal
                Write-Host "Parada obrigatória: Cota 429."
                ia release agy
                exit 1
            }
        } else {
            Write-Host "[DRY-RUN] delegar executor para $($item.ID) rodada $($item.Rodadas) com -ExigirCommit"
        }

        if (-not $DryRun) {
            node tools/auditar.cjs
            $auditorOrdem = "docs/prompts/backlog/tmp-auditor-$($item.ID).md"
            $vereditoPath = "docs/reviews/veredito-$($item.ID)-r$($item.Rodadas).md"
            $auditorTemplate = Get-Content "docs/prompts/backlog/auditor-modelo.md" -Raw
            $auditorContent = $auditorTemplate -replace '\{\{BRANCH\}\}', $branch -replace '\{\{ID\}\}', $item.ID -replace '\{\{VEREDITO_PATH\}\}', $vereditoPath
            Set-Content -Path $auditorOrdem -Value $auditorContent -Encoding utf8
            
            $modelosAuditor = @($null, "flash")
            $auditorSuccess = $false
            foreach ($m in $modelosAuditor) {
                try {
                    $cmd = "pwsh -File tools/delegar.ps1 -Ordem `"$auditorOrdem`" -Nome `"auditor-$($item.ID)-r$($item.Rodadas)`" -Papel auditor -Permitidos `"docs/reviews`" -Autonomo:$Autonomo"
                    if ($m) { $cmd += " -Modelo $m" }
                    Invoke-Expression $cmd
                    $auditorSuccess = $true
                    break
                } catch {
                    if ($_ -match '429') {
                        Write-Host "Cota 429 no auditor (modelo $($m))."
                        continue
                    }
                    ia release agy
                    throw $_
                }
            }
            if (-not $auditorSuccess) {
                $item.Status = 'BLOQUEADA'
                $item.Cota = "Atingida"
                Salvar-Fila $filaTotal
                Write-Host "Parada obrigatória: Cota 429 no auditor."
                ia release agy
                exit 1
            }
            
            $item.Veredito = $vereditoPath
            $resultado = Parse-Veredito -FilePath $vereditoPath
            
            $decisao = Test-Parada -Resultado $resultado -UltimaRejeicao $ultimaRejeicao
            if ($decisao -eq 'APROVADA') {
                $item.Status = 'PRONTA-PARA-REVISAO'
                Salvar-Fila $filaTotal
                break
            } elseif ($decisao -eq 'ESCALADO_SEM_PROVA') {
                $item.Status = 'ESCALADO'
                $item.Decisao = "Auditor sem prova real"
                Salvar-Fila $filaTotal
                break
            } elseif ($decisao -eq 'ESCALADO') {
                $item.Status = 'ESCALADO'
                $item.Decisao = "Mesmo defeito 2x"
                Salvar-Fila $filaTotal
                break
            }
            $ultimaRejeicao = $resultado.Motivo
        } else {
            Write-Host "[DRY-RUN] node tools/auditar.cjs"
            Write-Host "[DRY-RUN] delegar auditor para $($item.ID) rodada $($item.Rodadas)"
            break
        }
    }
    
    if (-not $DryRun) {
        ia release agy
    } else {
        Write-Host "[DRY-RUN] ia release agy"
    }
    
    if ($item.Status -eq 'ESCALADO') {
        $consecutiveEscalados++
        if ($consecutiveEscalados -ge 3) {
            Write-Host "Parada obrigatória: 3 itens ESCALADO seguidos."
            break
        }
    } else {
        $consecutiveEscalados = 0
    }
}

if (-not $DryRun) {
    Salvar-Fila $filaTotal
}
