# OpenCanvas installer for Windows
#
#   irm https://raw.githubusercontent.com/Devehab/OpenCanvas/HEAD/install.ps1 | iex
#
# Nothing needs to be installed first: the script downloads its own copy of
# Node.js and the ready-built app, starts it in the background on port 4790,
# and makes it start when you sign in. Manage it with the `opencanvas`
# command (opencanvas stop, opencanvas start, opencanvas uninstall...).
#
# Environment variables:
#   OPENCANVAS_PORT      port to use the first time (default 4790, or the next free one)
#   OPENCANVAS_HOME      install folder (default %LOCALAPPDATA%\OpenCanvas)
#   OPENCANVAS_VERSION   release tag to install, e.g. v0.1.0 (default: latest)
#   OPENCANVAS_NO_OPEN   set to 1 to not open the browser at the end
#   OPENCANVAS_BUNDLE    path or URL of an opencanvas.tar.gz to install instead of a release
#
# Everything runs inside a function so that an error never closes the
# PowerShell window that ran `irm ... | iex`.

function Install-OpenCanvas {
  $ErrorActionPreference = 'Stop'
  $ProgressPreference = 'SilentlyContinue'
  [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

  function Get-Setting($name, $default) {
    $value = [Environment]::GetEnvironmentVariable($name)
    if ([string]::IsNullOrWhiteSpace($value)) { $default } else { $value }
  }
  function Step($text) { Write-Host ''; Write-Host "==> $text" -ForegroundColor Cyan }
  function Test-PortBusy($port) {
    $listeners = [System.Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners()
    return [bool]($listeners | Where-Object { $_.Port -eq $port })
  }
  # .NET directly: Get-FileHash can be missing when Windows PowerShell is started from PowerShell 7.
  function Get-Sha256($path) {
    $stream = [IO.File]::OpenRead($path)
    try {
      $sha = [Security.Cryptography.SHA256]::Create()
      return (($sha.ComputeHash($stream) | ForEach-Object { $_.ToString('x2') }) -join '')
    } finally { $stream.Dispose() }
  }
  # Runs the opencanvas command in Windows PowerShell 5.1. Module paths inherited
  # from PowerShell 7 would hide its built-in commands, so they are cleared for it.
  function Invoke-Cli([string[]]$arguments) {
    $saved = $env:PSModulePath
    $env:PSModulePath = $null
    try { & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $cli @arguments } finally { $env:PSModulePath = $saved }
  }

  $repo = Get-Setting 'OPENCANVAS_REPO' 'Devehab/OpenCanvas'
  $version = Get-Setting 'OPENCANVAS_VERSION' 'latest'
  $ocHome = Get-Setting 'OPENCANVAS_HOME' (Join-Path $env:LOCALAPPDATA 'OpenCanvas')
  $defaultPort = 4790
  $nodeMajor = 22

  $arch = if ($env:PROCESSOR_ARCHITEW6432) { $env:PROCESSOR_ARCHITEW6432 } else { $env:PROCESSOR_ARCHITECTURE }
  switch ($arch) {
    'AMD64' { $arch = 'x64' }
    'ARM64' { $arch = 'arm64' }
    default { throw "OpenCanvas does not support $arch processors yet." }
  }
  $tarExe = Join-Path $env:SystemRoot 'System32\tar.exe'
  if (-not (Test-Path $tarExe)) { throw 'This version of Windows is too old (tar.exe is missing). Windows 10 or newer is needed.' }

  Write-Host "Installing OpenCanvas into $ocHome" -ForegroundColor White
  New-Item -ItemType Directory -Force -Path (Join-Path $ocHome 'logs') | Out-Null
  $tmp = Join-Path ([IO.Path]::GetTempPath()) ("opencanvas-" + [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Force -Path $tmp | Out-Null

  try {
    # Settings of an existing install (the port must stay the same: designs are saved per address).
    $configFile = Join-Path $ocHome 'config.json'
    $config = [ordered]@{}
    if (Test-Path $configFile) {
      $saved = Get-Content $configFile -Raw | ConvertFrom-Json
      foreach ($p in $saved.PSObject.Properties) { $config[$p.Name] = $p.Value }
    }
    $envPort = Get-Setting 'OPENCANVAS_PORT' ''
    if ($envPort) { $port = [int]$envPort }
    elseif ($config.port) { $port = [int]$config.port }
    else {
      $port = $defaultPort
      while (Test-PortBusy $port) {
        $port++
        if ($port -ge $defaultPort + 100) { throw "No free port between $defaultPort and $port." }
      }
    }

    Step 'Node.js'
    $base = "https://nodejs.org/dist/latest-v$nodeMajor.x"
    $sums = (Invoke-WebRequest -UseBasicParsing "$base/SHASUMS256.txt").Content
    $pattern = "\s(node-v[\d.]+-win-$arch\.zip)\s*$"
    $line = ($sums -split "`n") | Where-Object { $_ -match $pattern } | Select-Object -First 1
    if (-not $line -or -not ($line -match $pattern)) { throw "Node.js is not available for win-$arch." }
    $zipName = $Matches[1]
    $expected = ($line -split '\s+')[0].ToLower()
    $nodeVersion = ($zipName -replace '^node-', '') -replace '-win-.*$', ''
    $nodeDir = Join-Path $ocHome 'node'
    $nodeExe = Join-Path $nodeDir 'node.exe'
    $current = if (Test-Path $nodeExe) { (& $nodeExe --version) 2>$null } else { '' }
    if ($current -eq $nodeVersion) {
      Write-Host "  Node.js $nodeVersion is already installed"
    } else {
      Write-Host "  Downloading Node.js $nodeVersion"
      $zip = Join-Path $tmp $zipName
      Invoke-WebRequest -UseBasicParsing "$base/$zipName" -OutFile $zip
      if ((Get-Sha256 $zip) -ne $expected) { throw 'The Node.js download is damaged (checksum mismatch). Please try again.' }
      Expand-Archive -Path $zip -DestinationPath (Join-Path $tmp 'node') -Force
      if (Test-Path $nodeDir) { Remove-Item -Recurse -Force $nodeDir }
      Move-Item (Join-Path $tmp ('node\' + ($zipName -replace '\.zip$', ''))) $nodeDir
    }

    Step 'OpenCanvas'
    $bundle = Join-Path $tmp 'opencanvas.tar.gz'
    $source = Get-Setting 'OPENCANVAS_BUNDLE' ''
    $sum = ''
    if ($source -and (Test-Path $source)) {
      Copy-Item $source $bundle
      if (Test-Path "$source.sha256") { $sum = ((Get-Content "$source.sha256" -Raw) -split '\s+')[0] }
    } else {
      if (-not $source) {
        $source = if ($version -eq 'latest') { "https://github.com/$repo/releases/latest/download/opencanvas.tar.gz" }
        else { "https://github.com/$repo/releases/download/$version/opencanvas.tar.gz" }
      }
      try { Invoke-WebRequest -UseBasicParsing $source -OutFile $bundle }
      catch {
        $none = $false
        try { $none = ((Invoke-WebRequest -UseBasicParsing "https://api.github.com/repos/$repo/releases?per_page=1").Content -replace '\s', '') -eq '[]' } catch { }
        if ($none) { throw "No version of OpenCanvas has been published yet, so there is nothing to download. Try again in a few minutes: https://github.com/$repo/releases" }
        throw "Could not download $source. Check your internet connection and try again. Releases: https://github.com/$repo/releases"
      }
      # Saved to a file and read as text: GitHub serves it as binary, which
      # Invoke-WebRequest would return as bytes.
      $sumFile = Join-Path $tmp 'opencanvas.tar.gz.sha256'
      try {
        Invoke-WebRequest -UseBasicParsing "$source.sha256" -OutFile $sumFile
        $sum = ((Get-Content $sumFile -Raw).Trim() -split '\s+')[0]
      } catch { $sum = '' }
    }
    if ($sum -and ((Get-Sha256 $bundle) -ne $sum.ToLower())) { throw 'The OpenCanvas download is damaged (checksum mismatch). Please try again.' }
    $extract = Join-Path $tmp 'app'
    New-Item -ItemType Directory -Force -Path $extract | Out-Null
    & $tarExe -xzf $bundle -C $extract
    if ($LASTEXITCODE -ne 0) { throw 'The downloaded app is damaged. Please try again.' }
    $newApp = Join-Path $extract 'opencanvas'
    if (-not (Test-Path (Join-Path $newApp 'apps\web\server.js'))) { throw 'The downloaded app is incomplete.' }
    Write-Host "  Version $((Get-Content (Join-Path $newApp 'VERSION') -Raw).Trim())"

    # Replace the previous version, if any (stopping it first).
    $app = Join-Path $ocHome 'app'
    $cli = Join-Path $app 'bin\opencanvas.ps1'
    if (Test-Path $cli) { Invoke-Cli @('stop', '--quiet') | Out-Null }
    if (Test-Path $app) { Remove-Item -Recurse -Force $app }
    Move-Item $newApp $app

    # The opencanvas command, on the user's PATH.
    $bin = Join-Path $ocHome 'bin'
    New-Item -ItemType Directory -Force -Path $bin | Out-Null
    $cmd = "@echo off`r`nset PSModulePath=`r`npowershell.exe -NoProfile -ExecutionPolicy Bypass -File `"%~dp0..\app\bin\opencanvas.ps1`" %*`r`n"
    Set-Content -Path (Join-Path $bin 'opencanvas.cmd') -Value $cmd -Encoding ASCII -NoNewline
    $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
    $parts = @(if ($userPath) { $userPath -split ';' | Where-Object { $_ } })
    if ($parts -notcontains $bin) {
      [Environment]::SetEnvironmentVariable('Path', (($parts + $bin) -join ';'), 'User')
    }
    if (($env:Path -split ';') -notcontains $bin) { $env:Path = "$env:Path;$bin" }

    $config.port = $port
    $config.node = $nodeExe
    $config.repo = $repo
    $config | ConvertTo-Json | Set-Content -Path $configFile -Encoding UTF8

    Step "Starting OpenCanvas on port $port"
    Invoke-Cli @('start')
    if ($LASTEXITCODE -ne 0) { throw "OpenCanvas did not start. See $(Join-Path $ocHome 'logs\server.log')" }

    # Where to keep the work: asked once (the answer is kept on updates).
    $setup = Join-Path $app 'bin\cloud-setup.mjs'
    $storage = Get-Setting 'OPENCANVAS_STORAGE' ''
    if ($storage -or -not (Test-Path (Join-Path $ocHome 'cloud.json'))) {
      Step 'Where to keep your work'
      & $nodeExe $setup setup --home $ocHome --port $port
      if ($LASTEXITCODE -ne 0) { Write-Host '  Cloud storage was not set up. You can do it later with: opencanvas cloud' -ForegroundColor Yellow }
    } else {
      & $nodeExe $setup status --home $ocHome --port $port
    }

    $url = "http://localhost:$port"
    if ((Get-Setting 'OPENCANVAS_NO_OPEN' '0') -ne '1') { Start-Process $url }

    Write-Host ''
    Write-Host "OpenCanvas is installed: $url" -ForegroundColor Green
    Write-Host @'

  opencanvas stop        stop it (it won't start with Windows)
  opencanvas start       start it again
  opencanvas status      is it running?
  opencanvas update      install the latest version
  opencanvas cloud       keep your work in your cloud too (R2 / S3)
  opencanvas uninstall   remove it
'@
  } finally {
    Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
  }
}

try {
  Install-OpenCanvas
} catch {
  Write-Host ''
  Write-Host "error: $($_.Exception.Message)" -ForegroundColor Red
  $global:LASTEXITCODE = 1
}
