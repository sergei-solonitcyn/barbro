import { NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { AppModule } from "../app.module.js";
import { configureApp, createAdapter } from "../app.setup.js";
import { IdentityProvider } from "../auth/identity-provider.js";
import { type EnvSource, parseEnv } from "../config/env.js";

export async function createTestApp(
  source: EnvSource = {},
  options?: {},
  identityProvider?: IdentityProvider,
): Promise<NestFastifyApplication> {
  const env = parseEnv(source);

  let builer = Test.createTestingModule({
    imports: [AppModule.forRoot(env, options)],
  });

  if (identityProvider) {
    builer = builer
      .overrideProvider(IdentityProvider)
      .useValue(identityProvider);
  }

  const moduleRef = await builer.compile();

  const app = moduleRef.createNestApplication<NestFastifyApplication>(
    createAdapter(),
  );

  await configureApp(app);

  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}
