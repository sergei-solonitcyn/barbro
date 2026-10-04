# infra

Bootstrap for BarBro's single production server on Hetzner Cloud.

`cloud-init.yaml` is the server's first-boot configuration:

- the `ss` user with SSH public keys, passwordless sudo, and membership in the `docker` group;
- sshd hardening (key-only authentication, no root login, `AllowUsers ss`);
- Docker Engine and the Compose plugin from Docker's apt repository, with Docker's signing key pinned inline;
- the `local` Docker log driver (rotated, compressed) and `live-restore`;
- `unattended-upgrades` with a nightly automatic reboot;
- `jq` for the deploy agent.

cloud-init runs **once, on the first boot**. Editing the file does not change a running server — to apply a change, recreate the server. Application deployment is done by the deploy agent (below).

`compose.yaml` is the single runtime spec for the CI smoke tests and the server: `edge` (Caddy with `edge/Caddyfile`), `web`, `api`, and `tunnel` (`cloudflared`, in the `tunnel` profile, started only on the server). Web traffic reaches the server only through the Cloudflare Tunnel (ADR-0006 in `barbro-docs`, amendment of 2026-10-04).

## Create the server

Prerequisites:

- the `hcloud` CLI with a context for the project (`hcloud context create barbro`, API token with Read & Write);
- the SSH key and the firewall already exist in the project (`hcloud ssh-key list`, `hcloud firewall list`).

```sh
hcloud server create \
  --name barbro-server \
  --type cx23 \
  --image debian-13 \
  --location nbg1 \
  --ssh-key <ssh-key-name> \
  --firewall firewall-barbro \
  --user-data-from-file infra/cloud-init.yaml
```

Always pass user data from the file with the CLI. A server created through the Hetzner Console once came up with empty user data (`/var/lib/cloud/instance/user-data.txt` was empty) and ran with the image defaults, including password authentication.

The firewall allows inbound TCP 22 from anywhere; the reasoning and the accepted risk are in the threat model. No other inbound port is opened: web traffic arrives through the Cloudflare Tunnel, an outbound connection from the server.

If the new server reuses an IP address that a previous server had, remove the stale host key first:

```sh
ssh-keygen -R <ip>
```

## Verify after boot

Log in as `ss` (`ssh barbro`). The login itself proves that the user data was applied; a password prompt means it was not — log in as root with the key selected at creation and check the first command below.

| Command                                                                                                           | Expected                                                                                  |
|-------------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------|
| `curl -s http://169.254.169.254/hetzner/v1/userdata \| head -1`                                                   | `#cloud-config`                                                                           |
| `cloud-init status --wait --long`                                                                                 | `status: done`, `errors: []`                                                              |
| `sudo sshd -T \| grep -Ei '^(permitrootlogin\|passwordauthentication\|kbdinteractiveauthentication\|allowusers)'` | `no`, `no`, `no`, `ss`                                                                    |
| `docker info --format '{{.LoggingDriver}} {{.LiveRestoreEnabled}}'`                                               | `local true`                                                                              |
| `docker compose version`                                                                                          | a version string                                                                          |
| `sudo unattended-upgrade --dry-run --debug 2>&1 \| grep -i 'allowed origins'`                                     | Debian and Debian-Security origins for `trixie`                                           |
| `sudo grep -iE 'error\|traceback' /var/log/cloud-init.log`                                                        | nothing, or only `DEBUG` lines about a metadata request retried before the network was up |

Negative check — must fail:

```sh
ssh -i ~/.ssh/barbro_ed25519 -o IdentitiesOnly=yes root@<ip>   # rejected
```

## Validate changes locally

Run from the repository root before creating a server with a changed file. `podman` works the same as `docker`.

Schema (structure only — it does not check the contents of keys or apt sources):

```sh
docker run --rm -v "$PWD/infra:/w:ro" debian:trixie sh -c \
  'apt-get update -qq && apt-get install -y -qq cloud-init >/dev/null && cloud-init schema --config-file /w/cloud-init.yaml --annotate'
```

The pinned Docker key actually verifies Docker's repository:

```sh
docker run --rm -e DEBIAN_FRONTEND=noninteractive -v "$PWD/infra:/w:ro" debian:trixie bash -c '
  set -e
  apt-get update -qq && apt-get install -y -qq python3-yaml >/dev/null
  python3 -c "import yaml; print(yaml.safe_load(open(\"/w/cloud-init.yaml\"))[\"apt\"][\"sources\"][\"docker.list\"][\"key\"], end=\"\")" > /tmp/docker.asc
  echo "deb [signed-by=/tmp/docker.asc] https://download.docker.com/linux/debian trixie stable" > /etc/apt/sources.list.d/docker.list
  apt-get update 2>&1 | grep -E "download.docker.com|^[WE]:"
'
```

Pass: a `Get:… trixie/stable … Packages` line and no `W:`/`E:` lines. The key's fingerprint must be `9DC8 5822 9FC7 DD38 854A E2D8 8D81 803C 0EBF CD88` (`gpg --show-keys`).

## Cloudflare Tunnel

`cloudflared` connects out to Cloudflare and forwards every request for `barbro.dev` to `http://edge:8080`. The tunnel is remotely managed: its configuration lives in the Cloudflare dashboard, and the server holds only its token.

Set up once, before the first deploy with the `tunnel` profile:

1. Cloudflare Zero Trust → Networks → Tunnels → create tunnel `barbro`, connector type Cloudflared. Public hostname: `barbro.dev`, no path, service `HTTP`, URL `edge:8080`. Cloudflare creates the proxied CNAME record.
2. Copy the token from the install command the dashboard shows (the string after `--token`; do not run the command) and store it on the server without leaving it in the shell history:

   ```sh
   sudo install -d -m 0755 /etc/barbro
   sudo install -m 0440 -o root -g 65532 /dev/null /etc/barbro/tunnel-token
   sudo tee /etc/barbro/tunnel-token >/dev/null  # paste the token, Enter, Ctrl-D
   ```

   Compose mounts the file as the `tunnel-token` secret; the container (UID and GID 65532) reads it through the group. If the file is missing, the deploy fails and the agent rolls back.

Zone settings in the Cloudflare dashboard, kept here because they are not in the repository:

- SSL/TLS encryption mode Full (strict) — it does not affect tunnel traffic, but keeps any future non-tunnel record from reaching the origin over plain HTTP;
- Always Use HTTPS on; minimum TLS version 1.2; TLS 1.3 on;
- HSTS off in the dashboard — the edge Caddyfile sends it;
- DNSSEC enabled; DNS holds only the tunnel's CNAME for `barbro.dev`.

Rotate the token on any suspicion: delete the tunnel in the dashboard (this disconnects every connector holding the old token), create it again as above, replace the file, and restart the `tunnel` service with the Compose commands below.

## Deploy agent

`deploy/` holds the pull deploy agent (ADR-0007 in `barbro-docs`): `barbro-deploy` runs as the `barbro` system user, started by `barbro-deploy.timer` every 5 minutes. Each run deploys the HEAD of `main` once its CI push run has succeeded: it resolves `sha-<commit>` of both images to digests, fetches `infra/` of that commit, runs `docker compose pull` and `up -d` with the digests and the `tunnel` profile, and waits until `/api/health` and `/revision`, requested through the edge on `127.0.0.1:8082`, report the commit. If they do not, it rolls back to the running revision and marks the commit bad. The health check does not go through the tunnel, so a broken tunnel does not fail a deploy.

`edge` is recreated on every deploy: its Caddyfile is bind-mounted from the release directory, whose path changes with each commit.

State is in `/var/lib/barbro`: `current` and `previous` (revision and image digests), `bad` (one revision per line — delete a line to let the agent retry it), `releases/<commit>/infra/`.

### Install or update the agent

The agent does not update itself: after a change in `deploy/`, repeat the install.

First install, from a checkout of `main` (no release exists on the server yet):

```sh
scp -r infra/deploy barbro:/tmp/
ssh barbro
sudo useradd --system --user-group --no-create-home --home-dir /var/lib/barbro --shell /usr/sbin/nologin barbro
sudo install -m 0755 /tmp/deploy/barbro-deploy /usr/local/bin/
sudo install -m 0644 /tmp/deploy/barbro-deploy.service /tmp/deploy/barbro-deploy.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now barbro-deploy.timer
```

Update, on the server, from the release of the deployed commit — the version CI checked, not the state of a local checkout:

```sh
R="/var/lib/barbro/releases/$(sed -n 's/^REVISION=//p' /var/lib/barbro/current)/infra/deploy"
grep -n COMPOSE_PROFILES "$R/barbro-deploy"  # confirm the release has the expected change
sudo install -m 0755 "$R/barbro-deploy" /usr/local/bin/
sudo install -m 0644 "$R/barbro-deploy.service" "$R/barbro-deploy.timer" /etc/systemd/system/
sudo systemctl daemon-reload
```

A commit that changes the agent is deployed by the previous agent. If the commit's own deploy depends on the change (the `tunnel` profile did), install the new agent from the release afterwards and apply the change once by hand with the Compose commands below; the agent does not redeploy the running revision.

### Operate

| Task                    | Command                                                                         |
|-------------------------|---------------------------------------------------------------------------------|
| Run now                 | `sudo systemctl start barbro-deploy`                                            |
| Log                     | `journalctl -u barbro-deploy -n 50 --no-pager`                                  |
| Next run                | `systemctl list-timers barbro-deploy.timer`                                     |
| Deployed revision       | `cat /var/lib/barbro/current`                                                   |
| Roll back or freeze     | `echo <commit> \| sudo tee /etc/barbro/pin` (after `sudo mkdir -p /etc/barbro`) |
| Resume following `main` | `sudo rm /etc/barbro/pin`                                                       |

A pinned commit is deployed without the CI check, but its images must exist and it must pass the health check.

Compose commands for the running release need the same file, digests and profile the agent uses. Without `COMPOSE_PROFILES=tunnel`, Compose treats the `tunnel` service as inactive:

```sh
cd "/var/lib/barbro/releases/$(sed -n 's/^REVISION=//p' /var/lib/barbro/current)/infra"
set -a; . /var/lib/barbro/current; set +a  # REVISION, API_IMAGE, WEB_IMAGE
export COMPOSE_PROFILES=tunnel
docker compose -p barbro ps
docker compose -p barbro logs tunnel
docker compose -p barbro up -d  # apply the running release again, for example after a token rotation
```

The GitHub REST API allows 60 unauthenticated requests per hour per IP; the agent uses 24 (two per run). A `403` in the log means the limit was exceeded — for example by manual runs in quick succession.

## Updates

- **Debian packages** — `unattended-upgrades` installs updates from the Debian and Debian-Security origins daily and reboots at 03:30 server time (UTC) when an update requires it.
- **Docker Engine** — not covered by `unattended-upgrades`; upgrade manually:

  ```sh
  sudo apt-get update
  sudo apt-get install --only-upgrade docker-ce docker-ce-cli containerd.io docker-compose-plugin
  ```

  `live-restore` keeps containers running while the Docker daemon restarts.
