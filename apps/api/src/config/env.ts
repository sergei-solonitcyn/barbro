import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

const defaultHost = "127.0.0.1";
const defaultPort = 3000;

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

// A secret comes as a path to a file (a Compose secret in production), never as an env value.
// Errors name the variable only, never the content.
const secretFileSchema = filePathSchema.transform((file, ctx) => {
  let secret: string;
  try {
    secret = readFileSync(file, "utf8").trim();
  } catch {
    ctx.addIssue({ code: "custom", message: "cannot be read" });
    return z.NEVER;
  }
  if (secret.length === 0) {
    ctx.addIssue({ code: "custom", message: "is empty" });
    return z.NEVER;
  }
  return secret;
});

const originSchema = z
  .url({ protocol: /^https?$/ })
  .refine((value) => new URL(value).origin === value, {
    message: "must be an origin: scheme and host, no path or trailing slash",
  });

const envSchema = z
  .object({
    APP_REVISION: z.string().min(1).default("dev"),
    DB_PATH: filePathSchema,
    GOOGLE_CLIENT_ID: z.string().min(1),
    GOOGLE_CLIENT_SECRET_FILE: secretFileSchema,
    HOST: z.ipv4().default(defaultHost),
    PORT: z.coerce.number().int().min(1).max(65535).default(defaultPort),
    PUBLIC_ORIGIN: originSchema,
  })
  .transform((env) => {
    return {
      host: env.HOST,
      port: env.PORT,
      revision: env.APP_REVISION,
      dbPath: env.DB_PATH,
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET_FILE,
        redirectUri: `${env.PUBLIC_ORIGIN}/api/auth/google/callback`,
      },
    };
  });

export type Env = z.infer<typeof envSchema>;

export const parseEnv = (source: EnvSource): Env => {
  return envSchema.parse(source);
};
