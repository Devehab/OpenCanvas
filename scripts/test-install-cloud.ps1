# The installer's storage question on Windows against a real S3 server (moto):
# wrong keys fall back to "this computer only", right keys connect, and a
# reinstall finds the library left in the bucket.
#
#   scripts/test-install-cloud.ps1 path\to\opencanvas.tar.gz
#
# Needs: pip install "moto[server]"

param([Parameter(Mandatory = $true)][string]$Bundle)

$ProgressPreference = 'SilentlyContinue'
$root = Split-Path $PSScriptRoot -Parent
$script:Failed = $false
function Check($what, [scriptblock]$test) {
  $ok = $false
  try { $ok = [bool](& $test) } catch { $ok = $false }
  if ($ok) { Write-Host "PASS  $what" } else { Write-Host "FAIL  $what"; $script:Failed = $true }
}

$work = Join-Path ([IO.Path]::GetTempPath()) ('oc-cloud-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $work | Out-Null
$env:S3_TEST_OUT = Join-Path $work 's3.json'
$python = if ($env:PYTHON) { $env:PYTHON } else { 'python' }
$server = Start-Process -FilePath $python -ArgumentList "`"$root\scripts\s3-test-server.py`" 5077" -PassThru -WindowStyle Hidden `
  -RedirectStandardOutput (Join-Path $work 'out.log') -RedirectStandardError (Join-Path $work 'err.log')
# Importing moto can take a while on a fresh machine.
for ($i = 0; $i -lt 240 -and -not (Test-Path $env:S3_TEST_OUT); $i++) { Start-Sleep -Milliseconds 500 }
if (-not (Test-Path $env:S3_TEST_OUT)) {
  Write-Host 'The S3 test server did not start:'
  Get-Content (Join-Path $work 'out.log'), (Join-Path $work 'err.log') -ErrorAction SilentlyContinue
  exit 1
}
$s3 = Get-Content $env:S3_TEST_OUT -Raw | ConvertFrom-Json

$env:OPENCANVAS_NO_OPEN = '1'
$env:OPENCANVAS_BUNDLE = (Resolve-Path $Bundle).Path
$env:OPENCANVAS_STORAGE = 'custom'
$env:OPENCANVAS_S3_ENDPOINT = $s3.endpoint
$env:OPENCANVAS_S3_BUCKET = $s3.bucket
$env:OPENCANVAS_S3_ACCESS_KEY_ID = $s3.accessKeyId
$ocHome = Join-Path $env:LOCALAPPDATA 'OpenCanvas'
$oc = Join-Path $ocHome 'bin\opencanvas.cmd'

# Output of nested native commands is captured reliably through cmd and a file.
$n = 0
function Run-Logged([string]$commandLine) {
  $script:n++
  $file = Join-Path $work "log$($script:n).txt"
  # Windows PowerShell must not inherit PowerShell 7's module paths.
  cmd /c "set PSModulePath=&& $commandLine > `"$file`" 2>&1"
  $text = Get-Content $file -Raw
  Write-Host $text
  return $text
}
$installCmd = "powershell -NoProfile -ExecutionPolicy Bypass -Command `"Get-Content '$root\install.ps1' -Raw | Invoke-Expression`""

Write-Host '-------- wrong secret key --------'
$env:OPENCANVAS_S3_SECRET_ACCESS_KEY = 'wrong-wrong-wrong-wrong-wrong'
$log1 = Run-Logged $installCmd
Check 'it explains the key is wrong' { $log1 -match 'secret access key does not match' }
Check 'it keeps everything on this computer' { (Get-Content (Join-Path $ocHome 'cloud.json') -Raw) -match '"enabled":\s*false' }

Write-Host '-------- right keys with opencanvas cloud --------'
$env:OPENCANVAS_S3_SECRET_ACCESS_KEY = $s3.secretAccessKey
$log2 = Run-Logged "`"$oc`" cloud"
Check 'it connects' { $log2 -match 'connected' }
Check 'the setup token is gone' { -not (Test-Path (Join-Path $ocHome '.setup-token')) }
$log2b = Run-Logged "`"$oc`" cloud status"
Check 'opencanvas cloud status shows the bucket' { $log2b -match $s3.bucket }
$port = (Get-Content (Join-Path $ocHome 'config.json') -Raw | ConvertFrom-Json).port
$status = (Invoke-WebRequest -UseBasicParsing -Headers @{ 'x-opencanvas-sync' = '1' } "http://127.0.0.1:$port/api/cloud/status").Content
Write-Host "  $status"
Check 'the app sees the cloud, online' { $status -match '"online":true' }
Check 'the app never shows the secret' { -not $status.Contains($s3.secretAccessKey) }

Write-Host '-------- reinstall finds the library --------'
$seed = @"
import json, sys, boto3
d = json.load(open(sys.argv[1]))
s3 = boto3.client("s3", endpoint_url=d["endpoint"], region_name="us-east-1", aws_access_key_id=d["accessKeyId"], aws_secret_access_key=d["secretAccessKey"])
doc = {"v": 1, "store": "designs", "key": "d1", "deleted": False, "updatedAt": 1, "device": "x", "fp": "f", "value": {"id": "d1", "title": "Before", "pad": "x" * 1000}}
s3.put_object(Bucket=d["bucket"], Key="opencanvas/records/designs/d1.json", Body=json.dumps(doc).encode())
"@
$seedFile = Join-Path $work 'seed.py'
Set-Content -Path $seedFile -Value $seed
& $python $seedFile $env:S3_TEST_OUT
$log3 = Run-Logged "`"$oc`" uninstall -y"
Check 'uninstall reminds the work is in the bucket' { $log3 -match 'also in your cloud bucket' }
Start-Sleep -Seconds 6
$log4 = Run-Logged $installCmd
Check 'the installer finds the library from before' { $log4 -match 'Found your OpenCanvas library from before' }
Run-Logged "`"$oc`" uninstall -y" | Out-Null

Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue
Write-Host ''
if ($script:Failed) { Write-Host 'SOME CHECKS FAILED'; exit 1 } else { Write-Host 'ALL PASSED'; exit 0 }
