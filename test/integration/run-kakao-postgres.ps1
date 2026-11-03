param([string]$ReportPath)
$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$fixtureName = 'leren-kakao-it-' + [Guid]::NewGuid().ToString('N').Substring(0,8)
$fixturePassword = [Guid]::NewGuid().ToString('N') + [Guid]::NewGuid().ToString('N')
$configPath = Join-Path ([IO.Path]::GetTempPath()) ($fixtureName + '.json')
if (-not $ReportPath) { $ReportPath = Join-Path ([IO.Path]::GetTempPath()) ($fixtureName + '-results.json') }
$ReportPath = [IO.Path]::GetFullPath($ReportPath)
$originalConfig = $env:LEREN_KAKAO_PG_TEST_CONFIG
$originalReport = $env:LEREN_KAKAO_PG_REPORT
$created = $false
$result = 1
Push-Location $repoRoot
try {
  & npm run db:build
  if ($LASTEXITCODE -ne 0) { throw 'Database package build failed' }
  $containerId = & docker run -d --name $fixtureName --label codex.purpose=leren-kakao-integration --tmpfs /var/lib/postgresql:rw -p 127.0.0.1::5432 -e POSTGRES_DB=leren_kakao_it -e POSTGRES_PASSWORD=$fixturePassword pgvector/pgvector:pg18
  if ($LASTEXITCODE -ne 0) { throw 'Isolated PostgreSQL startup failed' }
  $created = $true
  $info = (& docker inspect $fixtureName | ConvertFrom-Json)[0]
  $port = [int]$info.NetworkSettings.Ports.'5432/tcp'[0].HostPort
  @{ name=$fixtureName;host='127.0.0.1';port=$port;database='leren_kakao_it';password=$fixturePassword } | ConvertTo-Json | Set-Content -LiteralPath $configPath -Encoding utf8
  $ready = $false
  for ($probe=0; $probe -lt 50; $probe++) {
    & docker exec $fixtureName pg_isready -U postgres -d leren_kakao_it *> $null
    if ($LASTEXITCODE -eq 0) { $ready=$true; break }
    Start-Sleep -Milliseconds 200
  }
  if (-not $ready) { throw 'Isolated PostgreSQL readiness timed out' }
  $env:LEREN_KAKAO_PG_TEST_CONFIG = $configPath
  $env:LEREN_KAKAO_PG_REPORT = $ReportPath
  & node --test test/integration/kakao-postgres.test.js
  $result = $LASTEXITCODE
  Write-Output ('Sanitized test evidence: ' + $ReportPath)
  Write-Output 'A passing refresh-race diagnostic means the known concurrency defect WAS reproduced, not fixed.'
} finally {
  $env:LEREN_KAKAO_PG_TEST_CONFIG = $originalConfig
  $env:LEREN_KAKAO_PG_REPORT = $originalReport
  if (Test-Path -LiteralPath $configPath) { Remove-Item -LiteralPath $configPath }
  if ($created) {
    $owned = (& docker inspect $fixtureName | ConvertFrom-Json)[0]
    if ($fixtureName -match '^leren-kakao-it-[0-9a-f]{8}$' -and $owned.Config.Labels.'codex.purpose' -eq 'leren-kakao-integration' -and $owned.HostConfig.Tmpfs.'/var/lib/postgresql' -eq 'rw') {
      & docker rm -f $fixtureName
      if ($LASTEXITCODE -ne 0) { throw 'Temporary container cleanup failed' }
    } else { throw 'Refusing cleanup: container ownership or tmpfs check failed' }
  }
  Pop-Location
}
exit $result
