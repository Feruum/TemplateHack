#!/usr/bin/env bash
set -euo pipefail

: "${METADATA_FILE:?METADATA_FILE is required}"

digest="$(jq -er .digest "${METADATA_FILE}")"
image="$(jq -er .image "${METADATA_FILE}")"
if [[ ! "${digest}" =~ ^sha256:[0-9a-f]{64}$ ]]; then
  echo 'Invalid agent image digest' >&2
  exit 1
fi
if [[ ! "${image}" =~ ^[^/]+/agent$ ]]; then
  echo 'Unexpected agent image repository' >&2
  exit 1
fi

registry_host="${image%%/*}"
registry_name="${registry_host%%.*}"
az acr login --name "${registry_name}" --only-show-errors >/dev/null

cosign verify \
  --certificate-oidc-issuer 'https://token.actions.githubusercontent.com' \
  --certificate-identity-regexp \
    '^https://github.com/StudyVerseApp/agentic-rag/.github/workflows/build-push.yml@refs/(heads|tags)/.+$' \
  "${image}@${digest}" >/dev/null

echo "Verified signed agent image ${image}@${digest}"
