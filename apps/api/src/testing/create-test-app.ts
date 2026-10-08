import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { AppModule, type AppModuleOptions } from "../app.module.js";
import { configureApp, createAdapter } from "../app.setup.js";
import { IdentityProvider } from "../auth/identity-provider.js";
import { type EnvSource, parseEnv } from "../config/env.js";

let secretFile: string | undefined;

// Required config every test app needs; a test overrides any of it through `source`.
function testEnvDefaults(): EnvSource {
  if (!secretFile) {
    secretFile = join(
      mkdtempSync(join(tmpdir(), "barbro-test-")),
      "google-client-secret",
    );
    writeFileSync(secretFile, "test-client-secret");
  }
  return {
    GOOGLE_CLIENT_ID: "test-client-id",
    GOOGLE_CLIENT_SECRET_FILE: secretFile,
    PUBLIC_ORIGIN: "http://localhost:5173",
  };
}

export async function createTestApp(
  source: EnvSource = {},
  options?: AppModuleOptions,
  identityProvider?: IdentityProvider,
): Promise<NestFastifyApplication> {
  const env = parseEnv({ ...testEnvDefaults(), ...source });
  let builder = Test.createTestingModule({
    imports: [AppModule.forRoot(env, options)],
  });
  if (identityProvider) {
    builder = builder
      .overrideProvider(IdentityProvider)
      .useValue(identityProvider);
  }
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication<NestFastifyApplication>(
    createAdapter(),
  );
  await configureApp(app);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}
