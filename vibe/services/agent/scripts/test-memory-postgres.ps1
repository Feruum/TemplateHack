param(
    [Parameter(Mandatory = $true)]
    [string]$AgentImage
)

$ErrorActionPreference = 'Stop'
$ragProjectPath = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$ragFixtureTag = 'templatehack-rag-' + [guid]::NewGuid().ToString('N').Substring(0, 10)
$ragNetworkId = $null
$ragPostgresId = $null
$ragResult = 1
try {
    $ragNetworkId = (docker network create --label 'codex.task=rag-consolidation' $ragFixtureTag).Trim()
    if ($LASTEXITCODE -ne 0) { throw 'Could not create isolated test network.' }
    $ragPostgresId = (docker run --pull never --rm -d --name ($ragFixtureTag + '-postgres') --label 'codex.task=rag-consolidation' --network $ragFixtureTag --network-alias notesdb --tmpfs /var/lib/postgresql -e POSTGRES_USER=memory_check -e POSTGRES_PASSWORD=local-memory-check -e POSTGRES_DB=agent_memory_test postgres:18-alpine).Trim()
    if ($LASTEXITCODE -ne 0) { throw 'Could not start isolated test PostgreSQL.' }
    $ragReady = $false
    for ($ragAttempt = 0; $ragAttempt -lt 50; $ragAttempt++) {
        docker exec $ragPostgresId pg_isready -U memory_check -d agent_memory_test *> $null
        if ($LASTEXITCODE -eq 0) { $ragReady = $true; break }
        Start-Sleep -Milliseconds 500
    }
    if (-not $ragReady) { throw 'Isolated PostgreSQL did not become ready.' }
    docker run --pull never --rm --network $ragFixtureTag --mount "type=bind,source=$ragProjectPath,target=/workspace,readonly" -e PYTHONPATH=/workspace/src -e OTEL_SDK_DISABLED=true -e TEST_AGENT_DATABASE_URL=postgresql+asyncpg://memory_check:local-memory-check@notesdb:5432/agent_memory_test -w /workspace $AgentImage python -m pytest -p no:cacheprovider tests/test_memory_notes.py -q
    $ragResult = $LASTEXITCODE
} finally {
    # IDs come only from resources created by this invocation; no shared stack is removed.
    if ($ragPostgresId -match '^[a-f0-9]{64}$') { docker rm -f -v $ragPostgresId *> $null }
    if ($ragNetworkId -match '^[a-f0-9]{64}$') { docker network rm $ragNetworkId *> $null }
}
exit $ragResult
