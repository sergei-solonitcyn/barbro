FROM node:26.10.0-trixie-slim@sha256:ec7758ee051e457b468b32bde57b0879010b325bb9862718e9615225ce4aaae1 AS build

WORKDIR /workspace

COPY package.json ./
RUN npm install --global "$(node -p "require('./package.json').packageManager.split('+')[0]")"

COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch

COPY . .

RUN pnpm --filter @barbro/web... install --offline --frozen-lockfile
RUN pnpm --filter @barbro/web... build

FROM caddy:2.11.6-alpine@sha256:d44355d3c2149dc580ce2cac735955d1c08d3d00882c30489c241aa51a5c10d9 AS runtime

RUN setcap -r /usr/bin/caddy

COPY apps/web/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /workspace/apps/web/dist /srv

RUN caddy fmt /etc/caddy/Caddyfile > /dev/null && \
    caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile

USER 65532:65532

EXPOSE 8080

CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]

ARG APP_REVISION
RUN test -n "$APP_REVISION"
ENV APP_REVISION=$APP_REVISION
