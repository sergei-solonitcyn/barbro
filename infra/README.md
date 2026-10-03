# infra

Bootstrap for BarBro's single production server on Hetzner Cloud.

`cloud-init.yaml` is the server's first-boot configuration:

- the `ss` user with SSH public keys, passwordless sudo, and membership in the `docker` group;
- sshd hardening (key-only authentication, no root login, `AllowUsers ss`);
- Docker Engine and the Compose plugin from Docker's apt repository, with Docker's signing key pinned inline;
- the `local` Docker log driver (rotated, compressed) and `live-restore`;
- `unattended-upgrades` with a nightly automatic reboot.

cloud-init runs **once, on the first boot**. Editing the file does not change a running server — to apply a change, recreate the server. Application deployment is not part of this file.

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

The firewall allows inbound TCP 22 from anywhere; the reasoning and the accepted risk are in the threat model. Ports 80/443 are added together with the edge proxy.

If the new server reuses an IP address that a previous server had, remove the stale host key first:

```sh
ssh-keygen -R <ip>
```

## Verify after boot

Log in as `ss` (`ssh barbro`). The login itself proves that the user data was applied; a password prompt means it was not — log in as root with the key selected at creation and check the first command below.

| Command | Expected |
|---|---|
| `curl -s http://169.254.169.254/hetzner/v1/userdata \| head -1` | `#cloud-config` |
| `cloud-init status --wait --long` | `status: done`, `errors: []` |
| `sudo sshd -T \| grep -Ei '^(permitrootlogin\|passwordauthentication\|kbdinteractiveauthentication\|allowusers)'` | `no`, `no`, `no`, `ss` |
| `docker info --format '{{.LoggingDriver}} {{.LiveRestoreEnabled}}'` | `local true` |
| `docker compose version` | a version string |
| `sudo unattended-upgrade --dry-run --debug 2>&1 \| grep -i 'allowed origins'` | Debian and Debian-Security origins for `trixie` |
| `sudo grep -iE 'error\|traceback' /var/log/cloud-init.log` | nothing, or only `DEBUG` lines about a metadata request retried before the network was up |

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

## Updates

- **Debian packages** — `unattended-upgrades` installs updates from the Debian and Debian-Security origins daily and reboots at 03:30 server time (UTC) when an update requires it.
- **Docker Engine** — not covered by `unattended-upgrades`; upgrade manually:

  ```sh
  sudo apt-get update
  sudo apt-get install --only-upgrade docker-ce docker-ce-cli containerd.io docker-compose-plugin
  ```

  `live-restore` keeps containers running while the Docker daemon restarts.
