#!/usr/bin/env bash
set -euo pipefail

: "${AZURE_RESOURCE_GROUP:?AZURE_RESOURCE_GROUP is required}"
: "${DEPLOYMENT_ENVIRONMENT:?DEPLOYMENT_ENVIRONMENT is required}"
: "${METADATA_FILE:?METADATA_FILE is required}"

commit="$(jq -er .commit "${METADATA_FILE}")"
digest="$(jq -er .digest "${METADATA_FILE}")"
image="$(jq -er .image "${METADATA_FILE}")"
version="$(jq -er .version "${METADATA_FILE}")"

if [[ ! "${digest}" =~ ^sha256:[0-9a-f]{64}$ ]]; then
  echo 'Invalid agent image digest' >&2
  exit 1
fi

immutable_image="${image}@${digest}"
run_job() {
  local job="$1"
  local timeout_seconds="$2"
  local execution_name status deadline

  az containerapp job update \
    --resource-group "${AZURE_RESOURCE_GROUP}" \
    --name "${job}" \
    --image "${immutable_image}" \
    --only-show-errors >/dev/null

  execution_name="$(az containerapp job start \
    --resource-group "${AZURE_RESOURCE_GROUP}" \
    --name "${job}" \
    --query name -o tsv)"

  deadline=$((SECONDS + timeout_seconds))
  status=''
  while (( SECONDS < deadline )); do
    status="$(az containerapp job execution list \
      --resource-group "${AZURE_RESOURCE_GROUP}" \
      --name "${job}" \
      --query "[?name=='${execution_name}'].properties.status | [0]" -o tsv)"
    case "${status}" in
      Succeeded) echo "Completed ${job} with ${immutable_image}"; return 0 ;;
      Failed) echo "${job} failed" >&2; return 1 ;;
    esac
    sleep 10
  done
  echo "${job} timed out (last status: ${status:-unknown})" >&2
  return 1
}

# Index schema and expand-only database migrations must both succeed before a
# revision is created or receives traffic.
run_job job-agent-search-index 600
run_job job-agent-migrate 900

worker=ca-agent-ingestion-worker
old_worker_revision="$(az containerapp revision list \
  --resource-group "${AZURE_RESOURCE_GROUP}" \
  --name "${worker}" \
  --query "sort_by([?properties.active], &properties.createdTime)[-1].name" -o tsv)"
worker_revision_suffix="v${version//./-}-${commit:0:7}"
az containerapp update \
  --resource-group "${AZURE_RESOURCE_GROUP}" \
  --name "${worker}" \
  --image "${immutable_image}" \
  --revision-suffix "${worker_revision_suffix}" \
  --set-env-vars "SERVICE_VERSION=${version}" "GIT_COMMIT=${commit}" \
    "BUILD_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --only-show-errors >/dev/null
new_worker_revision="$(az containerapp revision list \
  --resource-group "${AZURE_RESOURCE_GROUP}" \
  --name "${worker}" \
  --query "sort_by([?properties.active], &properties.createdTime)[-1].name" -o tsv)"
if [[ -z "${new_worker_revision}" || "${new_worker_revision}" == "${old_worker_revision}" ]]; then
  echo 'A new ingestion worker revision was not created' >&2
  exit 1
fi

app=ca-agent
old_revision="$(az containerapp revision list --resource-group "${AZURE_RESOURCE_GROUP}" \
  --name "${app}" --query "sort_by([?properties.active], &properties.createdTime)[-1].name" -o tsv)"
revision_suffix="v${version//./-}-${commit:0:7}"

az containerapp update \
  --resource-group "${AZURE_RESOURCE_GROUP}" \
  --name "${app}" \
  --image "${immutable_image}" \
  --revision-suffix "${revision_suffix}" \
  --set-env-vars "SERVICE_VERSION=${version}" "GIT_COMMIT=${commit}" \
    "BUILD_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --only-show-errors >/dev/null

new_revision="$(az containerapp revision list --resource-group "${AZURE_RESOURCE_GROUP}" \
  --name "${app}" --query "sort_by([?properties.active], &properties.createdTime)[-1].name" -o tsv)"
if [[ -z "${new_revision}" || "${new_revision}" == "${old_revision}" ]]; then
  echo 'A new agent revision was not created' >&2
  exit 1
fi

rollback() {
  if [[ -n "${old_revision}" ]]; then
    az containerapp ingress traffic set --resource-group "${AZURE_RESOURCE_GROUP}" \
      --name "${app}" --revision-weight "${old_revision}=100" "${new_revision}=0" \
      --only-show-errors >/dev/null || true
  fi
}
trap rollback ERR

if [[ "${GRADUAL_ROLLOUT:-false}" == 'true' && -n "${old_revision}" ]]; then
  weights=(1 10 50 100)
else
  weights=(100)
fi

for weight in "${weights[@]}"; do
  if [[ -n "${old_revision}" && "${weight}" -lt 100 ]]; then
    az containerapp ingress traffic set --resource-group "${AZURE_RESOURCE_GROUP}" \
      --name "${app}" --revision-weight "${old_revision}=$((100 - weight))" "${new_revision}=${weight}" \
      --only-show-errors >/dev/null
  else
    az containerapp ingress traffic set --resource-group "${AZURE_RESOURCE_GROUP}" \
      --name "${app}" --revision-weight "${new_revision}=100" \
      --only-show-errors >/dev/null
  fi

  if [[ -n "${SMOKE_URL:-}" ]]; then
    curl --fail --silent --show-error --max-time 15 "${SMOKE_URL}/health/ready" >/dev/null
  fi
  if [[ -n "${SLO_GATE_URL:-}" ]]; then
    curl --fail --silent --show-error --max-time 15 "${SLO_GATE_URL}?component=agent&weight=${weight}"
  fi
  if [[ "${weight}" -lt 100 ]]; then sleep 30; fi
done

trap - ERR
echo "Deployed agent ${immutable_image} (${version})"
