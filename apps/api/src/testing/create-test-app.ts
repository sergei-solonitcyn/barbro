import { NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { AppModule } from "../app.module.js";
import { configureApp, createAdapter } from "../app.setup.js";
import { type EnvSource, parseEnv } from "../config/env.js";

export async function createTestApp(
  source: EnvSource = {},
): Promise<NestFastifyApplication> {
  const env = parseEnv(source);
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule.forRoot(env)],
  }).compile();
  const app = moduleRef.createNestApplication<NestFastifyApplication>(
    createAdapter(),
  );
  configureApp(app);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}
