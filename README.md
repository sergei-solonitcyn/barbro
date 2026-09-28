# BarBro

BarBro is a web app for the home bar: you keep a list of the bottles and ingredients you have, see which cocktails you
can make right now from a database of real, verified recipes, and ask for a recommendation for a mood, an occasion or a
dish. The recommendation is the only place an LLM is involved, and it can only choose among cocktails you can already
make; it never invents a recipe.

This repository holds the code. Requirements, architecture, decisions (ADRs) and the threat model live in
[`barbro-docs`](https://github.com/sergei-solonitcyn/barbro-docs).

## Status

Early development: the project skeleton is being built. Nothing is deployed yet.

## Repository layout

A pnpm workspace:

| Path       | Package       | What it is                                         |
|------------|---------------|----------------------------------------------------|
| `apps/api` | `@barbro/api` | HTTP API: NestJS on the Fastify adapter            |
| `apps/web` | `@barbro/web` | Web client: a Vite + React single-page application |

The root `package.json` holds workspace tooling only; every package declares its own dependencies.

## Requirements

- **Node.js** at the exact version in [`.nvmrc`](.nvmrc). A version manager that reads `.nvmrc` (such as fnm or nvm)
  picks it up. Installing with any other major version fails on purpose (`engines` with `engineStrict`).
- **pnpm** at the version in the `packageManager` field of the root [`package.json`](package.json). See the
  [pnpm installation guide](https://pnpm.io/installation).

## Getting started

```sh
pnpm install
```

Run the API and the web client in two terminals:

```sh
pnpm --filter @barbro/api start:dev   # http://127.0.0.1:3000/api/health
pnpm --filter @barbro/web dev         # http://localhost:5173
```

The web dev server proxies `/api` to the API on `127.0.0.1:3000`, so the browser talks to a single origin, as it will in
production.

### API configuration

The API reads its configuration from environment variables and refuses to start if any value is invalid.

| Variable | Default     | Rule             |
|----------|-------------|------------------|
| `PORT`   | `3000`      | Integer, 1–65535 |
| `HOST`   | `127.0.0.1` | IPv4 address     |

## Checks

| Command          | What it does                                                             |
|------------------|--------------------------------------------------------------------------|
| `pnpm check`     | Biome: formatting, lint and import order, read-only                      |
| `pnpm fix`       | Biome with safe fixes applied                                            |
| `pnpm check:all` | Biome, then tests with coverage, type checks and builds for all packages |

Per package: `pnpm --filter <package> test`, `typecheck` or `build`.

A pre-commit hook runs Biome on staged files through lint-staged.

## Contributing

Changes go through pull requests to `main` and are squash-merged; pull request titles follow
[Conventional Commits](https://www.conventionalcommits.org/).

## Security

Please report vulnerabilities privately through GitHub's
[private vulnerability reporting](https://github.com/sergei-solonitcyn/barbro/security/advisories/new) rather than in
public issues. See the [security policy](https://github.com/sergei-solonitcyn/barbro-docs/blob/main/SECURITY.md).

## License

The code is licensed under the [GNU Affero General Public License v3.0 or later](LICENSE). The documentation in
`barbro-docs` is licensed separately under CC BY 4.0.
