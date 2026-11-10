$ErrorActionPreference = 'Stop'
$repo = Resolve-Path (Join-Path $PSScriptRoot '../..')
$name = 'leren-character-it-' + ([guid]::NewGuid().ToString('N')).Substring(0, 8)
$password = [guid]::NewGuid().ToString('N')
$previousConfig = $env:LEREN_CHARACTER_ONBOARDING_PG_TEST_CONFIG
$container = $null

Push-Location $repo
try {
  npm run db:build
  if ($LASTEXITCODE -ne 0) { throw 'Database package build failed.' }
  $id = docker run -d --rm --name $name --label 'codex.purpose=leren-character-onboarding-integration' --tmpfs '/var/lib/postgresql:rw' -e "POSTGRES_PASSWORD=$password" -e 'POSTGRES_DB=leren_character_it' -p '127.0.0.1::5432' 'pgvector/pgvector:pg18'
  if ($LASTEXITCODE -ne 0 -or $id -notmatch '^[0-9a-f]{64}$') { throw 'Isolated PostgreSQL container did not start.' }
  $container = $id

  $ready = $false
  for ($i = 0; $i -lt 30; $i++) {
    docker exec $container pg_isready -h 127.0.0.1 -U postgres -d leren_character_it *> $null
    if ($LASTEXITCODE -eq 0) { $ready = $true; break }
    Start-Sleep -Seconds 1
  }
  if (-not $ready) { throw 'Isolated PostgreSQL did not become ready.' }
  $binding = docker port $container '5432/tcp'
  if ($LASTEXITCODE -ne 0 -or $binding -notmatch '^127\.0\.0\.1:(\d+)$') { throw 'Could not verify the local-only PostgreSQL port.' }
  $env:LEREN_CHARACTER_ONBOARDING_PG_TEST_CONFIG = @{ name = $name; port = [int]$Matches[1]; password = $password } | ConvertTo-Json -Compress
  node --test test/integration/character-onboarding-postgres.test.js
  if ($LASTEXITCODE -ne 0) { throw 'Character onboarding PostgreSQL integration tests failed.' }
}
finally {
  $env:LEREN_CHARACTER_ONBOARDING_PG_TEST_CONFIG = $previousConfig
  if ($container) { docker stop $container *> $null }
  Pop-Location
}
