FROM node:26.12.1-trixie-slim@sha256:36793bcbb160a6a16cede1e62b93f84e26b78a972a8a4c0b879c1c12f22761ec AS build

WORKDIR /workspace

COPY package.json ./
RUN npm install --global "$(node -p "require('./package.json').packageManager.split('+')[0]")"

COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch

COPY . .

RUN pnpm --filter @barbro/web... install --offline --frozen-lockfile
RUN pnpm --filter @barbro/web... build

FROM caddy:2.11.7-alpine@sha256:d8542f48d34a9cf4e4c11a478865229840e87e4c96ea3f439101f31a5d35f75f AS runtime

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
