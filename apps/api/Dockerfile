FROM node:26.12.0-trixie-slim@sha256:0d1e33586362bb9e608c4e751e7a9e7edb55c9ac11461ed5666af696cc461dd4 AS build

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

FROM gcr.io/distroless/nodejs26-debian13:nonroot@sha256:b093852cde840e6f7ab2c2081adfbdb81810a340e06a2869fdc4ed31354c9d9e AS runtime

WORKDIR /app

COPY --from=build /out/ ./

COPY --from=build --chown=65532:65532 --chmod=700 /data-dir /data

ENV HOST=0.0.0.0

USER 65532:65532

EXPOSE 3000

CMD ["dist/main.js"]

ARG APP_REVISION
ENV APP_REVISION=$APP_REVISION
