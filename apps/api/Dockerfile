FROM node:26.13.0-trixie-slim@sha256:5adad64f9a1fca2d51972caa65983634c8a774eb300d72b20f7f2a0f60368072 AS build

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

FROM gcr.io/distroless/nodejs26-debian13:nonroot@sha256:767ffb7e2ffa9f4280f1af7b99f7f0a1cafb79d0dcc0e0d3aba43843748008a5 AS runtime

WORKDIR /app

COPY --from=build /out/ ./

COPY --from=build --chown=65532:65532 --chmod=700 /data-dir /data

ENV HOST=0.0.0.0

USER 65532:65532

EXPOSE 3000

CMD ["dist/main.js"]

ARG APP_REVISION
ENV APP_REVISION=$APP_REVISION
