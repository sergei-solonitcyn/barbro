FROM node:26.13.0-trixie-slim@sha256:e4db4c914bf8ad241bd24804fc25d272d89bad97e68cdc8a1414862790a02c39 AS build

WORKDIR /workspace

COPY package.json ./
RUN npm install --global "$(node -p "require('./package.json').packageManager.split('+')[0]")"

COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch

COPY . .

RUN pnpm --filter @barbro/web... install --offline --frozen-lockfile
RUN pnpm --filter @barbro/web... build

FROM caddy:2.11.7-alpine@sha256:e70b164da81ef698b3ad19af799ea6086ce6d9e48ed4079eb9fe26f6fbf14ee5 AS runtime

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
