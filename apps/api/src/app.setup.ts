import {
  FastifyAdapter,
  NestFastifyApplication,
} from "@nestjs/platform-fastify";

export const configureApp = (app: NestFastifyApplication) => {
  app.setGlobalPrefix("api");
};

export const createAdapter = (): FastifyAdapter => {
  return new FastifyAdapter({
    routerOptions: {
      ignoreTrailingSlash: true,
    },
  });
};
