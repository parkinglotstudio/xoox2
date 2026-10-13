param([switch]$OpenBrowser)
$ErrorActionPreference = 'Stop'
$arcadeProject = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$arcadeNode = (Get-Command node -ErrorAction Stop).Source
$arcadeLogDir = Join-Path $arcadeProject 'docs\playtests\runtime'
New-Item -ItemType Directory -Path $arcadeLogDir -Force | Out-Null
function Test-ArcadeUrl([string]$Url,[string]$Expected) {
    try { return (Invoke-WebRequest -Uri $Url -TimeoutSec 5 -UseBasicParsing).Content.Contains($Expected) } catch { return $false }
}
if (-not (Test-ArcadeUrl 'http://127.0.0.1:5190/arcade-game3.html' '/src/arcadeComplete/entries/game.ts')) {
    if (Get-NetTCPConnection -LocalPort 5190 -State Listen -ErrorAction SilentlyContinue) { throw '5190 포트를 다른 프로그램이 사용 중입니다.' }
    Start-Process -FilePath $arcadeNode -ArgumentList @('node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5190','--strictPort') -WorkingDirectory $arcadeProject -WindowStyle Hidden -RedirectStandardOutput (Join-Path $arcadeLogDir 'vite.out.log') -RedirectStandardError (Join-Path $arcadeLogDir 'vite.err.log') | Out-Null
}
if (-not (Test-ArcadeUrl 'http://127.0.0.1:4174/planner/play.html' 'arcade-game4.html')) {
    if (Get-NetTCPConnection -LocalPort 4174 -State Listen -ErrorAction SilentlyContinue) { throw '4174 포트를 다른 프로그램이 사용 중입니다.' }
    Start-Process -FilePath $arcadeNode -ArgumentList @('planner/server.js') -WorkingDirectory $arcadeProject -WindowStyle Hidden -RedirectStandardOutput (Join-Path $arcadeLogDir 'planner.out.log') -RedirectStandardError (Join-Path $arcadeLogDir 'planner.err.log') | Out-Null
}
for ($arcadeAttempt=0; $arcadeAttempt -lt 30; $arcadeAttempt++) {
    if ((Test-ArcadeUrl 'http://127.0.0.1:5190/arcade-game3.html' '/src/arcadeComplete/entries/game.ts') -and (Test-ArcadeUrl 'http://127.0.0.1:4174/planner/play.html' 'arcade-game4.html')) { break }
    Start-Sleep -Milliseconds 500
}
if (-not (Test-ArcadeUrl 'http://127.0.0.1:4174/planner/play.html' 'arcade-game4.html')) { throw '기획툴 실행 실패. docs/playtests/runtime의 로그를 확인하세요.' }
Write-Host '기획툴: http://localhost:4174/planner/#play'
Write-Host '캠페인: http://localhost:5190/arcade-lobby.html'
if ($OpenBrowser) { Start-Process 'http://localhost:4174/planner/#play' }
