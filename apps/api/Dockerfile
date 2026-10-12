FROM node:26.11.1-trixie-slim@sha256:193fe51b64e77981119c98c2002c9e32a70e2f006fb4d25068ce0558998917f0 AS build

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

FROM gcr.io/distroless/nodejs26-debian13:nonroot@sha256:a3bb283a564754266646d6029c5b6aa4f760b9415dae1398db8d7f8142ee1375 AS runtime

WORKDIR /app

COPY --from=build /out/ ./

COPY --from=build --chown=65532:65532 --chmod=700 /data-dir /data

ENV HOST=0.0.0.0

USER 65532:65532

EXPOSE 3000

CMD ["dist/main.js"]

ARG APP_REVISION
ENV APP_REVISION=$APP_REVISION
