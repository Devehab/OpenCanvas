# opencanvas: start, stop and manage OpenCanvas on this computer (Windows).
# Installed by install.ps1 and run through opencanvas.cmd; `opencanvas help` lists the commands.
# Works with Windows PowerShell 5.1 and PowerShell 7.

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$OcHome = if ($env:OPENCANVAS_HOME) { $env:OPENCANVAS_HOME } else { Split-Path (Split-Path $PSScriptRoot -Parent) -Parent }
$App = Join-Path $OcHome 'app'
$ConfigFile = Join-Path $OcHome 'config.json'
$LogDir = Join-Path $OcHome 'logs'
$Log = Join-Path $LogDir 'server.log'
$Launcher = Join-Path $OcHome 'launch.vbs'
$ServerJs = Join-Path $App 'apps\web\server.js'
$RunKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'

$Config = [ordered]@{ port = 4790; node = (Join-Path $OcHome 'node\node.exe'); repo = 'Devehab/OpenCanvas' }
if (Test-Path $ConfigFile) {
  $saved = Get-Content $ConfigFile -Raw | ConvertFrom-Json
  foreach ($p in $saved.PSObject.Properties) { $Config[$p.Name] = $p.Value }
}
$Port = [int]$Config.port
$Url = "http://localhost:$Port"

$Command = if ($args.Count -gt 0) { [string]$args[0] } else { 'help' }
$Flags = @($args | Select-Object -Skip 1)
$Quiet = $Flags -contains '-q' -or $Flags -contains '--quiet'
$Yes = $Flags -contains '-y' -or $Flags -contains '--yes'

function Say($text, $color) {
  if ($Quiet) { return }
  if ($color) { Write-Host $text -ForegroundColor $color } else { Write-Host $text }
}

function Test-Healthy {
  try {
    $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 "http://127.0.0.1:$Port/api/health"
    return $r.Content -match 'opencanvas-web'
  } catch { return $false }
}

function Wait-Until($want, $seconds) {
  for ($i = 0; $i -lt $seconds; $i++) {
    $up = Test-Healthy
    if (($want -eq 'up' -and $up) -or ($want -eq 'down' -and -not $up)) { return $true }
    Start-Sleep -Seconds 1
  }
  return $false
}

function Get-ServerProcess {
  Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
    Where-Object { $_.CommandLine -and $_.CommandLine.Contains($ServerJs) }
}

function Write-Launcher {
  # A hidden window: wscript runs node without a console, logging to the log file.
  $q = { param($s) $s.Replace('"', '""') }
  $node = & $q $Config.node
  $server = & $q $ServerJs
  $log = & $q $Log
  $app = & $q $App
  $installDir = & $q $OcHome
  $vbs = @"
' Starts OpenCanvas without a window. Written by: opencanvas start
Set shell = CreateObject("WScript.Shell")
Set env = shell.Environment("Process")
env("PORT") = "$Port"
env("HOSTNAME") = "127.0.0.1"
env("NODE_ENV") = "production"
env("NEXT_TELEMETRY_DISABLED") = "1"
env("OPENCANVAS_HOME") = "$installDir"
shell.CurrentDirectory = "$app"
shell.Run "cmd /c """"$node"" ""$server"" >> ""$log"" 2>&1""", 0, False
"@
  Set-Content -Path $Launcher -Value $vbs -Encoding ASCII
}

function Invoke-Start {
  if (-not (Test-Path $ServerJs) -or -not (Test-Path $Config.node)) {
    Say 'OpenCanvas is not installed correctly. Reinstall it in PowerShell:' Red
    Say "  irm https://raw.githubusercontent.com/$($Config.repo)/HEAD/install.ps1 | iex"
    return $false
  }
  New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
  Write-Launcher
  # Start with Windows: run the launcher when this user signs in. A new
  # account may not have the Run key yet.
  try {
    if (-not (Test-Path $RunKey)) { New-Item -Path $RunKey -Force | Out-Null }
    Set-ItemProperty -Path $RunKey -Name 'OpenCanvas' -Value "wscript.exe `"$Launcher`""
  } catch {
    Say "Could not set OpenCanvas to start with Windows: $($_.Exception.Message)" Yellow
  }
  if (-not (Test-Healthy) -and -not (Get-ServerProcess)) {
    Start-Process -FilePath 'wscript.exe' -ArgumentList "`"$Launcher`"" -WindowStyle Hidden
  }
  if (Wait-Until 'up' 60) {
    Say "OK  OpenCanvas is running: $Url" Green
    Say '    It starts by itself when you sign in to Windows. Stop it with: opencanvas stop'
    return $true
  }
  Say "OpenCanvas did not start. The last lines of ${Log}:" Red
  if (Test-Path $Log) { Get-Content $Log -Tail 20 | ForEach-Object { Say $_ } }
  return $false
}

function Invoke-Stop {
  Remove-ItemProperty -Path $RunKey -Name 'OpenCanvas' -ErrorAction SilentlyContinue
  Get-ServerProcess | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  if (Wait-Until 'down' 15) {
    Say 'OK  OpenCanvas is stopped.' Green
    Say '    It will not start with Windows until you run: opencanvas start'
    return $true
  }
  Say "Something is still answering on port $Port." Red
  return $false
}

function Get-Version {
  $f = Join-Path $App 'VERSION'
  if (Test-Path $f) { (Get-Content $f -Raw).Trim() } else { 'unknown' }
}

function Invoke-Status {
  $up = Test-Healthy
  if ($up) { Write-Host "* OpenCanvas $(Get-Version) is running: $Url" -ForegroundColor Green }
  else { Write-Host "o OpenCanvas $(Get-Version) is stopped. Start it with: opencanvas start" -ForegroundColor Red }
  Write-Host "  Folder: $OcHome"
  Write-Host "  Logs:   $Log"
  return $up
}

function Invoke-Uninstall {
  if (-not $Yes) {
    $answer = Read-Host 'Remove OpenCanvas from this computer? Designs stay in your browser. [y/N]'
    if ($answer -notmatch '^(y|yes)$') { Say 'Nothing removed.'; return $false }
  }
  $inCloud = (Test-Path (Join-Path $OcHome 'cloud.json')) -and ((Get-Content (Join-Path $OcHome 'cloud.json') -Raw) -match '"enabled":\s*true')
  $script:Quiet = $true
  Invoke-Stop | Out-Null
  $bin = Join-Path $OcHome 'bin'
  $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
  if ($userPath) {
    $kept = ($userPath -split ';') | Where-Object { $_ -and ($_.TrimEnd('\') -ne $bin.TrimEnd('\')) }
    [Environment]::SetEnvironmentVariable('Path', ($kept -join ';'), 'User')
  }
  # Delete the folder a moment later, once opencanvas.cmd (inside it) has exited.
  Start-Process -FilePath 'cmd.exe' -ArgumentList "/c ping -n 3 127.0.0.1 >nul & rmdir /s /q `"$OcHome`"" -WindowStyle Hidden
  Write-Host 'OK  OpenCanvas was removed.' -ForegroundColor Green
  Write-Host "    Your designs are still saved in your browser (at $Url) if you install it again."
  if ($inCloud) { Write-Host '    They are also in your cloud bucket: install again and choose the same bucket to get everything back.' }
  return $true
}

# Where work is kept: this computer only, or also your cloud storage (R2 / S3).
function Invoke-Cloud($sub) {
  if (-not $sub) { $sub = 'setup' }
  if ($sub -notin 'setup', 'status', 'off') { Say "Unknown: opencanvas cloud $sub" Red; return $false }
  # The server checks the bucket and keeps the keys, so it must be running.
  if (-not (Test-Healthy)) {
    $script:Quiet = $true
    $started = Invoke-Start
    $script:Quiet = $false
    if (-not $started) { Say 'OpenCanvas could not start. See: opencanvas logs' Red; return $false }
  }
  & $Config.node (Join-Path $App 'bin\cloud-setup.mjs') $sub --home $OcHome --port $Port
  return $LASTEXITCODE -eq 0
}

function Show-Help {
  Write-Host @"
OpenCanvas $(Get-Version), running at $Url

  opencanvas start       Start it (and start it with Windows)
  opencanvas stop        Stop it (and don't start it with Windows)
  opencanvas restart     Stop and start again
  opencanvas status      Is it running?
  opencanvas open        Open it in the browser
  opencanvas logs        Show the last lines of the log
  opencanvas update      Install the latest version
  opencanvas cloud       Choose where your work is kept: this computer, or also
                         your cloud storage (Cloudflare R2, Amazon S3)
  opencanvas cloud status | off
  opencanvas uninstall   Remove it from this computer (-y: don't ask)
"@
}

$ok = $true
switch ($Command.ToLower()) {
  'start' { $ok = Invoke-Start }
  'stop' { $ok = Invoke-Stop }
  'restart' { $q = $Quiet; $script:Quiet = $true; Invoke-Stop | Out-Null; $script:Quiet = $q; $ok = Invoke-Start }
  'status' { $ok = Invoke-Status }
  'open' {
    if (-not (Test-Healthy)) { $ok = Invoke-Start }
    if ($ok) { Start-Process $Url }
  }
  { $_ -in 'logs', 'log' } { if (Test-Path $Log) { Get-Content $Log -Tail 100 } else { Write-Host 'No log yet.' } }
  { $_ -in 'update', 'upgrade' } {
    Write-Host 'Updating OpenCanvas...'
    $env:OPENCANVAS_HOME = $OcHome
    $installer = Invoke-RestMethod "https://raw.githubusercontent.com/$($Config.repo)/HEAD/install.ps1"
    Invoke-Expression $installer
  }
  'cloud' { $ok = Invoke-Cloud $(if ($Flags.Count -gt 0) { [string]$Flags[0] } else { 'setup' }) }
  { $_ -in 'uninstall', 'remove' } { $ok = Invoke-Uninstall }
  { $_ -in 'version', '--version', '-v' } { Write-Host (Get-Version) }
  { $_ -in 'help', '--help', '-h' } { Show-Help }
  default { Write-Host "Unknown command: $Command" -ForegroundColor Red; Show-Help; $ok = $false }
}
if ($ok) { exit 0 } else { exit 1 }
