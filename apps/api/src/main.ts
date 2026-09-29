import { NestFactory } from "@nestjs/core";
import { NestFastifyApplication } from "@nestjs/platform-fastify";
import { ZodError, z } from "zod";
import { AppModule } from "./app.module.js";
import { configureApp, createAdapter } from "./app.setup.js";
import { Env, parseEnv } from "./config/env.js";

async function bootstrap() {
  let env: Env;
  try {
    env = parseEnv(process.env);
  } catch (error) {
    if (error instanceof ZodError) {
      console.error(
        `Invalid environment configuration: ${z.prettifyError(error)}`,
      );
    } else {
      throw error;
    }
    process.exitCode = 1;
    return;
  }
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule.forRoot(env),
    createAdapter(),
  );
  configureApp(app);
  app.enableShutdownHooks();
  await app.listen(env.port, env.host);
}
await bootstrap();
