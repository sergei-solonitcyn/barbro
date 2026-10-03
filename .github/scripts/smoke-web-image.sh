#!/usr/bin/env bash
set -euo pipefail

: "${IMAGE:?IMAGE is required}"
: "${EXPECTED_REVISION:?EXPECTED_REVISION is required}"

cli="${CONTAINER_CLI:-docker}"

# Runs the service through infra/compose.yaml, so CI tests the production runtime flags.
# Compose interpolates the whole file, including the service this script never starts;
# that image is never pulled. -p keeps the smoke run apart from a running "barbro" project.
export API_IMAGE=unused WEB_IMAGE="$IMAGE"
compose=("$cli" compose -p barbro-smoke -f infra/compose.yaml)
base_url="http://127.0.0.1:8081"

cleanup() {
  "${compose[@]}" down >/dev/null 2>&1 || true
}
trap cleanup EXIT

fail() {
  echo "Smoke test failed: $*" >&2
  echo "Container logs:" >&2
  "${compose[@]}" logs web >&2 || true
  exit 1
}

status_of() {
  curl -sS -o /dev/null -w '%{http_code}' "$base_url$1"
}

header_of() {
  curl -sS -o /dev/null -D - "$base_url$1" \
    | grep -i "^$2:" | sed -E 's/^[^:]+:[[:space:]]*//' | tr -d '\r' || true
}

user="$("$cli" image inspect --format '{{.Config.User}}' "$IMAGE")"
[[ "$user" == "65532:65532" ]] || fail "image user is '$user', expected 65532:65532"

"${compose[@]}" up -d web

index="$(curl -fsS --retry 15 --retry-delay 1 --retry-all-errors "$base_url/")" \
  || fail "GET / did not succeed"
[[ "$(header_of / content-type)" == text/html* ]] || fail "GET / is not text/html"
[[ "$(header_of / cache-control)" == "no-cache" ]] || fail "GET / is not no-cache"

deep="$(curl -fsS "$base_url/bar/anything")" || fail "GET /bar/anything did not succeed"
[[ "$deep" == "$index" ]] || fail "SPA fallback did not return index.html"

asset="$(grep -oE '/assets/[^"]+\.js' <<<"$index" | head -n 1 || true)"
[[ -n "$asset" ]] || fail "index.html references no /assets/*.js"
[[ "$(status_of "$asset")" == "200" ]] || fail "GET $asset is not 200"
[[ "$(header_of "$asset" cache-control)" == *immutable* ]] || fail "GET $asset is not immutable"

[[ "$(status_of /assets/nope.js)" == "404" ]] || fail "missing asset is not 404"
[[ -z "$(header_of /assets/nope.js cache-control)" ]] || fail "missing asset has Cache-Control"

revision="$(curl -fsS "$base_url/revision")" || fail "GET /revision did not succeed"
[[ "$revision" == "$EXPECTED_REVISION" ]] \
  || fail "revision is '$revision', expected '$EXPECTED_REVISION'"

logs="$("${compose[@]}" logs web 2>&1)"
if grep -q '"level":"error"' <<<"$logs"; then
  fail "error in container logs"
fi

echo "Smoke test passed: $asset, revision $revision"
