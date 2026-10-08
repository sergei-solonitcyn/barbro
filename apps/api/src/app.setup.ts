import fastifyCookie from "@fastify/cookie";
import {
  FastifyAdapter,
  NestFastifyApplication,
} from "@nestjs/platform-fastify";

export const configureApp = async (app: NestFastifyApplication) => {
  app.setGlobalPrefix("api");
  await app.register(fastifyCookie);
};

export const createAdapter = (): FastifyAdapter => {
  return new FastifyAdapter({
    routerOptions: {
      ignoreTrailingSlash: true,
    },
  });
};
