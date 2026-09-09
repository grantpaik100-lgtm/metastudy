param(
  [string]$SqlFile = "tests/v2/supabase-gateway-runtime.sql"
)

$ErrorActionPreference = "Stop"

$postgresBin = "C:\Users\user\AppData\Local\Temp\studymeta-pg15-portable\pgsql\bin"
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$sqlPath = [IO.Path]::GetFullPath((Join-Path $repositoryRoot $SqlFile))
$tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd("\")
$runName = "studymeta-stage2b-" + [guid]::NewGuid().ToString("N")
$runRoot = Join-Path $tempRoot $runName
$pgdata = Join-Path $runRoot "pgdata"
$serverLog = Join-Path $runRoot "postgres.log"
$databaseName = "studymeta_stage2b"
$started = $false

foreach ($binaryName in @("postgres.exe", "pg_ctl.exe", "initdb.exe", "createdb.exe", "psql.exe")) {
  $binaryPath = Join-Path $postgresBin $binaryName
  if (-not (Test-Path -LiteralPath $binaryPath -PathType Leaf)) {
    throw "Required PostgreSQL binary is missing: $binaryPath"
  }
}
if (-not (Test-Path -LiteralPath $sqlPath -PathType Leaf)) {
  throw "Runtime SQL file is missing: $sqlPath"
}

New-Item -ItemType Directory -Path $runRoot | Out-Null
$resolvedRunRoot = (Resolve-Path -LiteralPath $runRoot).Path
$safePrefix = $tempRoot + [IO.Path]::DirectorySeparatorChar
if (
  -not $resolvedRunRoot.StartsWith($safePrefix, [StringComparison]::OrdinalIgnoreCase) -or
  -not ([IO.Path]::GetFileName($resolvedRunRoot)).StartsWith("studymeta-stage2b-")
) {
  throw "Refusing to use a runtime directory outside the validated TEMP scope"
}

$listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
$listener.Start()
$port = ([Net.IPEndPoint]$listener.LocalEndpoint).Port
$listener.Stop()

$pgCtl = Join-Path $postgresBin "pg_ctl.exe"
$initdb = Join-Path $postgresBin "initdb.exe"
$createdb = Join-Path $postgresBin "createdb.exe"
$psql = Join-Path $postgresBin "psql.exe"
$postgres = Join-Path $postgresBin "postgres.exe"

Write-Output "postgres_version=$(& $postgres --version)"
Write-Output "runtime_root=$resolvedRunRoot"
Write-Output "runtime_port=$port"

try {
  & $initdb -D $pgdata -U postgres -A trust --encoding=UTF8 --no-locale
  if ($LASTEXITCODE -ne 0) {
    throw "initdb failed with exit code $LASTEXITCODE"
  }

  & $pgCtl -D $pgdata -l $serverLog -o "-p $port -h 127.0.0.1" start -w
  if ($LASTEXITCODE -ne 0) {
    throw "pg_ctl start failed with exit code $LASTEXITCODE"
  }
  $started = $true

  & $createdb -h 127.0.0.1 -p $port -U postgres $databaseName
  if ($LASTEXITCODE -ne 0) {
    throw "createdb failed with exit code $LASTEXITCODE"
  }

  & $psql -X -h 127.0.0.1 -p $port -U postgres -d $databaseName -v ON_ERROR_STOP=1 -f $sqlPath
  if ($LASTEXITCODE -ne 0) {
    throw "psql failed with exit code $LASTEXITCODE"
  }
  Write-Output "postgres_runtime=PASS"
} finally {
  if ($started) {
    & $pgCtl -D $pgdata stop -m fast -w
    if ($LASTEXITCODE -ne 0) {
      throw "Unable to stop the PostgreSQL server started for this runtime"
    }
    $started = $false
    Write-Output "postgres_stop=PASS"
  }

  if (Test-Path -LiteralPath $runRoot) {
    $cleanupPath = (Resolve-Path -LiteralPath $runRoot).Path
    if (
      $cleanupPath.StartsWith($safePrefix, [StringComparison]::OrdinalIgnoreCase) -and
      ([IO.Path]::GetFileName($cleanupPath)).StartsWith("studymeta-stage2b-")
    ) {
      Remove-Item -LiteralPath $cleanupPath -Recurse -Force
      Write-Output "postgres_cleanup=PASS"
    } else {
      throw "Refusing to clean a directory outside the validated TEMP scope"
    }
  }
}
