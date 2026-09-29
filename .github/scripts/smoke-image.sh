#!/usr/bin/env bash
set -euo pipefail

:"${IMAGE:?IMAGE is required}"
: "${EXPECTED_REVISION:?EXPECTED_REVISION is required}"

container="smoke-$$"
cleanup() {
  docker rm -f "$container" >/dev/null 2>&1 || true;
}
trap cleanup EXIT

expected_major="$(sed -E 's/^v?([0-9]+).*/\1/' .nvmrc)"
actual_major="$(docker run --rm --entrypoint /nodejs/bin/node "$IMAGE" \
  -p 'process.versions.node.split(".")[0]')"
if [[ "$actual_major" != "$expected_major" ]]; then
  echo "Node major mismatch: image $actual_major, .nvmrc $expected_major" >&2
  exit 1
fi

docker run -d --name "$container" -p 127.0.0.1:3000:3000 "$IMAGE" >/dev/null

if ! body="$(curl -fsS --retry 15 --retry-delay 1 --retry-all-errors \
  http://127.0.0.1:3000/api/health)"; then
  echo "Health check failed; container logs:" >&2
  docker logs "$container" >&2
  exit 1
fi

revision="$(jq -r '.revision' <<<"$body")"
if [[ "$revision" != "$EXPECTED_REVISION" ]]; then
  echo "Revision mismatch: got $revision, expected $EXPECTED_REVISION" >&2
  exit 1
fi

echo "Smoke test passed: Node $actual_major, revision $revision"
