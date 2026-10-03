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
        return @{ Status = 'REJEITADA'; Motivo = $motivo; Lixo = $false }
    } else {
        return @{ Status = 'REJEITADA'; Motivo = 'Primeira linha fora do padrao'; Lixo = $true }
    }
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

$fila = Ler-Fila
$ItensArray = $Itens | ForEach-Object { $_ -split ',' } | ForEach-Object { $_.Trim() } | Where-Object { $_ }
if ($ItensArray.Count -gt 0) {
    $fila = $fila | Where-Object { $ItensArray -contains $_.ID }
}

$consecutiveEscalados = 0

foreach ($item in $fila) {
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
        git checkout main
        git checkout -b $branch
    } else {
        Write-Host "[DRY-RUN] git checkout main; git checkout -b $branch"
    }

    $ultimaRejeicao = ""

    while ($item.Rodadas -lt $MaxRodadas) {
        $item.Rodadas += 1
        
        $ordem = $promptPath
        if (-not $DryRun) {
            try {
                pwsh -File tools/delegar.ps1 -Ordem $ordem -Nome "exec-$($item.ID)-r$($item.Rodadas)" -Papel executor -Autonomo:$Autonomo
            } catch {
                if ($_ -match '429') {
                    $item.Status = 'BLOQUEADA'
                    $item.Cota = "Atingida"
                    Salvar-Fila $fila
                    Write-Host "Parada obrigatória: Cota 429."
                    exit 1
                } else {
                    throw $_
                }
            }
        } else {
            Write-Host "[DRY-RUN] delegar executor para $($item.ID) rodada $($item.Rodadas)"
        }

        if (-not $DryRun) {
            node tools/auditar.cjs
            $auditorOrdem = "docs/prompts/backlog/auditor-modelo.md"
            $vereditoPath = "docs/reviews/veredito-$($item.ID)-r$($item.Rodadas).md"
            
            try {
                pwsh -File tools/delegar.ps1 -Ordem $auditorOrdem -Nome "auditor-$($item.ID)-r$($item.Rodadas)" -Papel auditor -Permitidos "docs/reviews" -Autonomo:$Autonomo
            } catch {
                if ($_ -match '429') {
                    $item.Status = 'BLOQUEADA'
                    $item.Cota = "Atingida"
                    Salvar-Fila $fila
                    Write-Host "Parada obrigatória: Cota 429 no auditor."
                    exit 1
                }
            }
            
            $item.Veredito = $vereditoPath
            $resultado = Parse-Veredito -FilePath $vereditoPath
            
            if ($resultado.Status -eq 'APROVADA') {
                $item.Status = 'PRONTA-PARA-REVISAO'
                Salvar-Fila $fila
                break
            } else {
                if ($resultado.Lixo -or (-not ($resultado.Motivo -match '```'))) {
                    $item.Status = 'ESCALADO'
                    $item.Decisao = "Auditor sem prova real"
                    Salvar-Fila $fila
                    break
                }
                
                if ($ultimaRejeicao -ne "" -and $ultimaRejeicao -eq $resultado.Motivo) {
                    $item.Status = 'ESCALADO'
                    $item.Decisao = "Mesmo defeito 2x"
                    Salvar-Fila $fila
                    break
                }
                
                $ultimaRejeicao = $resultado.Motivo
            }
        } else {
            Write-Host "[DRY-RUN] node tools/auditar.cjs"
            Write-Host "[DRY-RUN] delegar auditor para $($item.ID) rodada $($item.Rodadas)"
            break
        }
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
Salvar-Fila $fila
