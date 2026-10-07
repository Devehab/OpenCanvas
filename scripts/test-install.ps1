# Installs OpenCanvas on Windows the way a person would, then checks every command.
# Used by .github/workflows/install-test.yml.
#
#   scripts/test-install.ps1 path\to\opencanvas.tar.gz   test this bundle with .\install.ps1
#   scripts/test-install.ps1 published                   the real one-liner, from GitHub

param([Parameter(Mandatory = $true)][string]$Bundle)

$ProgressPreference = 'SilentlyContinue'
$root = Split-Path $PSScriptRoot -Parent
$env:OPENCANVAS_NO_OPEN = '1'
$script:Failed = $false

function Check($what, [scriptblock]$test) {
  $ok = $false
  try { $ok = [bool](& $test) } catch { $ok = $false }
  if ($ok) { Write-Host "PASS  $what" } else { Write-Host "FAIL  $what"; $script:Failed = $true }
}

function Install-Once {
  if ($Bundle -eq 'published') {
    Write-Host '$ irm https://raw.githubusercontent.com/Devehab/OpenCanvas/HEAD/install.ps1 | iex'
    Invoke-RestMethod https://raw.githubusercontent.com/Devehab/OpenCanvas/HEAD/install.ps1 | Invoke-Expression
  } else {
    Write-Host "$ Get-Content install.ps1 | iex   (OPENCANVAS_BUNDLE=$Bundle)"
    $env:OPENCANVAS_BUNDLE = (Resolve-Path $Bundle).Path
    Get-Content (Join-Path $root 'install.ps1') -Raw | Invoke-Expression
  }
}

Write-Host "-------- Windows $([Environment]::OSVersion.Version) --------"
Write-Host "  node: $((Get-Command node -ErrorAction SilentlyContinue).Source)"

$global:LASTEXITCODE = 0
Install-Once
Check 'the installer succeeds' { $global:LASTEXITCODE -eq 0 }

$ocHome = Join-Path $env:LOCALAPPDATA 'OpenCanvas'
$port = (Get-Content (Join-Path $ocHome 'config.json') -Raw | ConvertFrom-Json).port
$runKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
function Test-Up {
  try { (Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 "http://127.0.0.1:$port/api/health").Content -match 'opencanvas-web' }
  catch { $false }
}
function Test-Autostart { $null -ne (Get-ItemProperty -Path $runKey -Name 'OpenCanvas' -ErrorAction SilentlyContinue) }
function OC { & opencanvas @args | Out-Host; return $LASTEXITCODE }

Check 'the opencanvas command is on the PATH' { Get-Command opencanvas -ErrorAction Stop }
Check "the port is $port, not 3000" { $port -ne 3000 }
Check 'the server answers' { Test-Up }
Check 'the editor page loads' { (Invoke-WebRequest -UseBasicParsing -TimeoutSec 20 "http://127.0.0.1:$port/").StatusCode -eq 200 }
Check 'opencanvas status says running' { (OC status) -eq 0 }
Check 'it is set to start with Windows' { Test-Autostart }

OC stop | Out-Null
Check 'opencanvas stop stops it' { -not (Test-Up) }
Check 'stop also turns off starting with Windows' { -not (Test-Autostart) }
Check 'opencanvas status says stopped' { (OC status) -ne 0 }

OC start | Out-Null
Check 'opencanvas start starts it again' { Test-Up }
OC restart | Out-Null
Check 'opencanvas restart' { Test-Up }

# Installing again (what `opencanvas update` does) keeps the port and the server.
Install-Once | Out-Null
Check 'installing again keeps the port' { (Get-Content (Join-Path $ocHome 'config.json') -Raw | ConvertFrom-Json).port -eq $port }
Check 'the server is back after installing again' { Test-Up }

OC uninstall -y | Out-Null
Start-Sleep -Seconds 6
Check 'opencanvas uninstall stops it' { -not (Test-Up) }
Check 'opencanvas uninstall removes the folder' { -not (Test-Path $ocHome) }
Check 'opencanvas uninstall turns off starting with Windows' { -not (Test-Autostart) }

Write-Host ''
if ($script:Failed) { Write-Host 'SOME CHECKS FAILED'; exit 1 } else { Write-Host 'ALL PASSED'; exit 0 }
