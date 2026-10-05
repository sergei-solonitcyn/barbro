import path from "node:path";
import { z } from "zod";

const defaultHost = "127.0.0.1";
const defaultPort = 3000;

const baseDir = process.cwd();

export type EnvSource = NodeJS.ProcessEnv;

const filePathSchema = z
  .string()
  .min(1)
  .refine((value) => !value.includes("\0"), {
    message: "must not contain null bytes",
  })
  .refine((value) => path.basename(value).length > 0, {
    message: "must be a valid file path",
  });

const envSchema = z
  .object({
    APP_REVISION: z.string().min(1).default("dev"),
    DB_PATH: filePathSchema,
    HOST: z.ipv4().default(defaultHost),
    PORT: z.coerce.number().int().min(1).max(65535).default(defaultPort),
  })
  .transform((env) => {
    return {
      host: env.HOST,
      port: env.PORT,
      revision: env.APP_REVISION,
      dbPath: env.DB_PATH,
    };
  });

export type Env = z.infer<typeof envSchema>;

export const parseEnv = (source: EnvSource): Env => {
  return envSchema.parse(source);
};
