import { z } from "zod";

const defaultHost = "127.0.0.1";
const defaultPort = 3000;

const envSchema = z
  .object({
    HOST: z.ipv4().default(defaultHost),
    PORT: z.coerce.number().int().min(1).max(65535).default(defaultPort),
  })
  .transform((env) => {
    return {
      host: env.HOST,
      port: env.PORT,
    };
  });

export type Env = z.infer<typeof envSchema>;

export const parseEnv = (source: NodeJS.ProcessEnv): Env => {
  return envSchema.parse(source);
};
