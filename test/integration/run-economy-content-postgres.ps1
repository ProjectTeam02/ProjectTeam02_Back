$ErrorActionPreference = 'Stop'
$repo = Resolve-Path (Join-Path $PSScriptRoot '../..')
$name = 'leren-economy-it-' + ([guid]::NewGuid().ToString('N')).Substring(0, 8)
$password = [guid]::NewGuid().ToString('N')
$previousConfig = $env:LEREN_ECONOMY_PG_TEST_CONFIG
$containerStarted = $false

Push-Location $repo
try {
  npm run db:build
  if ($LASTEXITCODE -ne 0) { throw 'Database package build failed.' }
  docker run -d --rm --name $name --label 'codex.purpose=leren-economy-content-integration' --tmpfs '/var/lib/postgresql:rw' -e "POSTGRES_PASSWORD=$password" -e 'POSTGRES_DB=leren_economy_it' -p '127.0.0.1::5432' 'pgvector/pgvector:pg18' | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Isolated PostgreSQL container did not start.' }
  $containerStarted = $true

  $ready = $false
  for ($i = 0; $i -lt 30; $i++) {
    docker exec $name pg_isready -h 127.0.0.1 -U postgres -d leren_economy_it *> $null
    if ($LASTEXITCODE -eq 0) { $ready = $true; break }
    Start-Sleep -Seconds 1
  }
  if (-not $ready) { throw 'Isolated PostgreSQL did not become ready.' }
  $binding = docker port $name '5432/tcp'
  if ($LASTEXITCODE -ne 0 -or $binding -notmatch '^127\.0\.0\.1:(\d+)$') { throw 'Could not verify the local-only PostgreSQL port.' }
  $env:LEREN_ECONOMY_PG_TEST_CONFIG = @{ name = $name; port = [int]$Matches[1]; password = $password } | ConvertTo-Json -Compress
  node --test test/integration/economy-content-postgres.test.js
  if ($LASTEXITCODE -ne 0) { throw 'Economy content integration tests failed.' }
}
finally {
  $env:LEREN_ECONOMY_PG_TEST_CONFIG = $previousConfig
  if ($containerStarted) { docker stop $name *> $null }
  Pop-Location
}
