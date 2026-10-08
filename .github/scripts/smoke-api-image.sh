#!/usr/bin/env bash
set -euo pipefail

: "${IMAGE:?IMAGE is required}"
: "${EXPECTED_REVISION:?EXPECTED_REVISION is required}"

cli="${CONTAINER_CLI:-docker}"

# Runs the service through infra/compose.yaml, so CI tests the production runtime flags.
# Compose interpolates the whole file, including the service this script never starts;
# that image is never pulled. -p keeps the smoke run apart from a running "barbro" project.
export API_IMAGE="$IMAGE" WEB_IMAGE=unused
compose=("$cli" compose -p barbro-smoke -f infra/compose.yaml)
base_url="http://127.0.0.1:3000"

cleanup() {
  "${compose[@]}" down >/dev/null 2>&1 || true
  rm -rf "$secret_dir"
}

# The API refuses to start without the secret file. A dummy is enough:
# discovery is lazy, so the smoke test never contacts Google.
secret_dir="$(mktemp -d)"
printf 'smoke-test-secret' >"$secret_dir/google-client-secret"
chmod 0444 "$secret_dir/google-client-secret"
export GOOGLE_CLIENT_SECRET_PATH="$secret_dir/google-client-secret"

trap cleanup EXIT

fail() {
  echo "Smoke test failed: $*" >&2
  echo "Container logs:" >&2
  "${compose[@]}" logs api >&2 || true
  exit 1
}

expected_major="$(sed -E 's/^v?([0-9]+).*/\1/' .nvmrc)"
actual_major="$("$cli" run --rm --entrypoint /nodejs/bin/node "$IMAGE" \
  -p 'process.versions.node.split(".")[0]')"
[[ "$actual_major" == "$expected_major" ]] \
  || fail "Node major mismatch: image $actual_major, .nvmrc $expected_major"

"${compose[@]}" up -d api

body="$(curl -fsS --retry 15 --retry-delay 1 --retry-all-errors "$base_url/api/health")" \
  || fail "GET /api/health did not succeed"

revision="$(jq -r '.revision' <<<"$body")"
[[ "$revision" == "$EXPECTED_REVISION" ]] \
  || fail "revision is '$revision', expected '$EXPECTED_REVISION'"

echo "Smoke test passed: Node $actual_major, revision $revision"
