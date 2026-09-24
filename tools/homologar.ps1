# tools/homologar.ps1 - Script de Homologacao Limpa (V5)
# Executa preparo estrito e inicializacao para homologacao humana no Motorola Edge 70 Pro
[CmdletBinding()]
param(
  [switch]$SkipGitCheck,
  [switch]$NoLaunch
)

$ErrorActionPreference = "Stop"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "   OneToOneSupport - Homologacao Limpa (Fase 07)" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Verificacao de Git (Branch e Arvore Limpa)
if (-not $SkipGitCheck) {
  # Nota: (git ...) pode avaliar para $null quando executado como arquivo .ps1 (mesmo com saida de
  # uma linha so, em certas versoes do PowerShell); [string]$x = $null tambem pode virar $null em vez
  # de "" nesse contexto. Out-String garante sempre uma string real, nunca $null.
  $currentBranch = (git rev-parse --abbrev-ref HEAD | Out-String).Trim()
  $expectedBranch = "fase/07-homologacao-1"
  if ($currentBranch -ne $expectedBranch) {
    Write-Error "[ERRO] Branch incorreta: '$currentBranch'. Esperada: '$expectedBranch'."
    exit 1
  }

  $gitStatus = (git status --porcelain | Out-String).Trim()
  if ($gitStatus) {
    Write-Error "[ERRO] Existem alteracoes nao commitadas na arvore Git. Faca commit antes de homologar:`n$gitStatus"
    exit 1
  }
  Write-Host "[Git] Branch '$currentBranch' verificada e arvore 100% limpa." -ForegroundColor Green
}

# 2. Encerramento de processos anteriores
Write-Host "[Processos] Encerrando instancias residuais de Electron e Vite..." -ForegroundColor Yellow
$procNames = @("electron")
foreach ($p in $procNames) {
  Get-Process -Name $p -ErrorAction SilentlyContinue | ForEach-Object {
    Write-Host "  Encerrando processo: $($_.ProcessName) (PID: $($_.Id))"
    Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
  }
}
Start-Sleep -Seconds 1

# 3. Limpeza do Banco de Dados SQLite em %APPDATA%\OneToOneSupport
$appDataDir = Join-Path $env:APPDATA "OneToOneSupport"
if (Test-Path $appDataDir) {
  Write-Host "[Banco] Limpando dados do banco em '$appDataDir' com app fechado..." -ForegroundColor Yellow
  $dbFiles = Get-ChildItem -Path $appDataDir -Recurse -File -Include "*.db", "*.db-wal", "*.db-shm", "*.snapshot"
  if ($dbFiles.Count -eq 0) {
    Write-Host "  Nenhum arquivo de banco residual encontrado." -ForegroundColor Gray
  } else {
    foreach ($file in $dbFiles) {
      Remove-Item -Path $file.FullName -Force
      Write-Host "  [Homologar] Arquivo de banco removido: $($file.FullName)" -ForegroundColor Cyan
    }
  }
} else {
  Write-Host "[Banco] Pasta '$appDataDir' ainda nao existe (sera criada no startup)." -ForegroundColor Gray
}

# 4. Compilacao Completa (Build)
Write-Host "[Build] Executando 'npm run build'..." -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -ne 0) {
  Write-Error "[ERRO] Falha ao compilar o projeto (exit code $LASTEXITCODE)."
  exit $LASTEXITCODE
}
Write-Host "[Build] Build concluido com sucesso." -ForegroundColor Green

# 5. Leitura do Carimbo de Versao
$buildInfoPath = Join-Path $PSScriptRoot "..\src\shared\build-info.json"
$stamp = "desconhecido"
if (Test-Path $buildInfoPath) {
  $buildInfo = Get-Content $buildInfoPath -Raw | ConvertFrom-Json
  $stamp = $buildInfo.stamp
}
Write-Host "----------------------------------------------------------" -ForegroundColor DarkGray
Write-Host "  Carimbo de Versao Ativo: $stamp" -ForegroundColor Green
Write-Host "----------------------------------------------------------" -ForegroundColor DarkGray

# 6. Informacoes de Conexao LAN
$lanIp = "127.0.0.1"
try {
  $ipObj = Get-NetIPAddress -AddressFamily IPv4 | Where-Object {
    $_.InterfaceAlias -notmatch 'Loopback|vEthernet|WSL|Tailscale' -and $_.IPAddress -notlike '169.254*'
  } | Select-Object -First 1
  if ($ipObj) {
    $lanIp = $ipObj.IPAddress
  }
} catch {
  $lanIp = "127.0.0.1"
}

Write-Host "Instrucoes para o Testador:" -ForegroundColor Cyan
Write-Host "  1. O Host iniciara com ONETOONE_DIAG=1 ativado."
Write-Host "  2. No Host, inicie uma sessao para o atendido para obter o link/QR Code."
Write-Host "  3. No Motorola Edge 70 Pro (mesma rede LAN), acesse a URL indicada pelo Host."
Write-Host "     (IP detectado na rede: $lanIp)"
Write-Host "  4. Verifique que o carimbo de versao no rodape do Host e no topo do Guest e:"
Write-Host "     '$stamp'" -ForegroundColor White
Write-Host "----------------------------------------------------------" -ForegroundColor DarkGray

# 7. Inicializacao do Ambiente Dev com Diagnostico
if ($NoLaunch) {
  Write-Host "[Homologar] Modo NoLaunch ativado: preparo e build concluidos com sucesso." -ForegroundColor Green
  exit 0
}

$env:ONETOONE_DIAG = "1"
Write-Host "[Startup] Iniciando ambiente com ONETOONE_DIAG=1..." -ForegroundColor Green
npm run dev
