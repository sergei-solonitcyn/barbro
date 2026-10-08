#!/usr/bin/env bash
set -euo pipefail

: "${API_IMAGE:?API_IMAGE is required}"
: "${WEB_IMAGE:?WEB_IMAGE is required}"
: "${EXPECTED_REVISION:?EXPECTED_REVISION is required}"

cli="${CONTAINER_CLI:-docker}"

# Starts every service from infra/compose.yaml and checks them through the edge
# proxy, the way the Cloudflare Tunnel reaches them in production.
# COMPOSE_FILE overrides the file for local runs (for example a podman variant).
export API_IMAGE WEB_IMAGE
compose=("$cli" compose -p barbro-smoke -f "${COMPOSE_FILE:-infra/compose.yaml}")
base_url="http://127.0.0.1:8082"

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
  "${compose[@]}" logs >&2 || true
  exit 1
}

# Prints the response headers of GET $1, without carriage returns.
# Extra arguments go to curl.
headers_of() {
  local path="$1"
  shift
  curl -sS -o /dev/null -D - "$@" "$base_url$path" | tr -d '\r'
}

# Prints the value of header $2 in the header block $1, or nothing.
header_value() {
  grep -i "^$2:" <<<"$1" | sed -E 's/^[^:]+:[[:space:]]*//' || true
}

"${compose[@]}" up -d

# The edge answers before the upstreams are ready (502), so retry on any error.
body="$(curl -fsS --retry 30 --retry-delay 1 --retry-all-errors "$base_url/api/health")" \
  || fail "GET /api/health through edge did not succeed"
# A body that is not JSON (the SPA answering instead of the API) must fail the check,
# not abort the script under set -e.
api_revision="$(jq -r '.revision' <<<"$body" 2>/dev/null || true)"
[[ "$api_revision" == "$EXPECTED_REVISION" ]] \
  || fail "api revision is '$api_revision', expected '$EXPECTED_REVISION'"

web_revision="$(curl -fsS --retry 30 --retry-delay 1 --retry-all-errors "$base_url/revision")" \
  || fail "GET /revision through edge did not succeed"
[[ "$web_revision" == "$EXPECTED_REVISION" ]] \
  || fail "web revision is '$web_revision', expected '$EXPECTED_REVISION'"

me_status="$(curl -sS -o /dev/null -w '%{http_code}' "$base_url/api/me")"
[[ "$me_status" == "401" ]] || fail "GET /api/me without a session returned $me_status, expected 401"

# Until the upstreams listen, the edge logs every retried request as an error.
# Only log lines after this point count.
startup_lines="$("${compose[@]}" logs edge 2>&1 | wc -l)"

# Security headers on both upstreams: the SPA and the API.
for path in / /api/health; do
  headers="$(headers_of "$path")"
  for name in Strict-Transport-Security Content-Security-Policy X-Content-Type-Options \
    Referrer-Policy Permissions-Policy; do
    [[ -n "$(header_value "$headers" "$name")" ]] || fail "GET $path has no $name"
  done
  [[ -z "$(header_value "$headers" Server)" ]] || fail "GET $path exposes Server"
done

# Compression is the edge's job; caching headers come from web and must pass through.
index="$(curl -fsS "$base_url/")" || fail "GET / through edge did not succeed"
asset="$(grep -oE '/assets/[^"]+\.js' <<<"$index" | head -n 1 || true)"
[[ -n "$asset" ]] || fail "index.html references no /assets/*.js"
headers="$(headers_of "$asset" -H 'Accept-Encoding: gzip')"
[[ "$(header_value "$headers" Content-Encoding)" == "gzip" ]] \
  || fail "GET $asset is not gzip-encoded through edge"
[[ "$(header_value "$headers" Cache-Control)" == *immutable* ]] \
  || fail "GET $asset lost Cache-Control: immutable through edge"

logs="$("${compose[@]}" logs edge 2>&1 | tail -n "+$((startup_lines + 1))")"
if grep -q '"level":"error"' <<<"$logs"; then
  fail "error in edge logs"
fi

echo "Smoke test passed through edge: revision $EXPECTED_REVISION, $asset"
