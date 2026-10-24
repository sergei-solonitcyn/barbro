FROM node:26.12.1-trixie-slim@sha256:36793bcbb160a6a16cede1e62b93f84e26b78a972a8a4c0b879c1c12f22761ec AS build

WORKDIR /workspace

COPY package.json ./
RUN npm install --global "$(node -p "require('./package.json').packageManager.split('+')[0]")"

COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch

COPY . .

RUN pnpm --filter @barbro/api... install --offline --frozen-lockfile
RUN pnpm --filter @barbro/api... build
RUN pnpm --filter @barbro/api deploy --prod /out

RUN mkdir /data-dir

FROM gcr.io/distroless/nodejs26-debian13:nonroot@sha256:96455baef11b178fc135b32206e3922c515dbed2400676c94f907f8f84e6abf6 AS runtime

WORKDIR /app

COPY --from=build /out/ ./

COPY --from=build --chown=65532:65532 --chmod=700 /data-dir /data

ENV HOST=0.0.0.0

USER 65532:65532

EXPOSE 3000

CMD ["dist/main.js"]

ARG APP_REVISION
ENV APP_REVISION=$APP_REVISION
