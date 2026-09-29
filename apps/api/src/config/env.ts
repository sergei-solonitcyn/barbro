import { z } from "zod";

const defaultHost = "127.0.0.1";
const defaultPort = 3000;

export type EnvSource = NodeJS.ProcessEnv;

const envSchema = z
  .object({
    APP_REVISION: z.string().min(1).default("dev"),
    HOST: z.ipv4().default(defaultHost),
    PORT: z.coerce.number().int().min(1).max(65535).default(defaultPort),
  })
  .transform((env) => {
    return {
      host: env.HOST,
      port: env.PORT,
      revision: env.APP_REVISION,
    };
  });

export type Env = z.infer<typeof envSchema>;

export const parseEnv = (source: EnvSource): Env => {
  return envSchema.parse(source);
};
