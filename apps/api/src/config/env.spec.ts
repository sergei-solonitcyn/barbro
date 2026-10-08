import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { type EnvSource, parseEnv } from "./env.js";

const dir = mkdtempSync(join(tmpdir(), "barbro-env-"));

function secretFile(name: string, content: string): string {
  const file = join(dir, name);
  writeFileSync(file, content);
  return file;
}

const base: EnvSource = {
  DB_PATH: "custom_path.sqlite",
  GOOGLE_CLIENT_ID: "client-id",
  GOOGLE_CLIENT_SECRET_FILE: secretFile("secret", "client-secret"),
  PUBLIC_ORIGIN: "https://barbro.dev",
};

function expectInvalid(overrides: EnvSource) {
  expect(() => parseEnv({ ...base, ...overrides })).toThrow(ZodError);
}

describe("parseEnv", () => {
  it("returns correct defaults", () => {
    const env = parseEnv(base);

    expect(env.host).toBe("127.0.0.1");
    expect(env.port).toBe(3000);
    expect(env.revision).toBe("dev");
  });

  it("returns correct values", () => {
    const env = parseEnv({
      ...base,
      APP_REVISION: "abc123",
      HOST: "0.0.0.0",
      PORT: "8080",
    });

    expect(env.host).toBe("0.0.0.0");
    expect(env.port).toBe(8080);
    expect(env.revision).toBe("abc123");
    expect(env.dbPath).toBe("custom_path.sqlite");
  });

  it.each([
    ["HOST is empty", { HOST: "" }],
    ["HOST is not a valid IP address", { HOST: "192.168.1.256" }],
    ["PORT is invalid", { PORT: "invalid" }],
    ["PORT is empty", { PORT: "" }],
    ["PORT is not an int number", { PORT: "3000.5" }],
    ["PORT is less than 1", { PORT: "0" }],
    ["PORT is greater than 65535", { PORT: "65536" }],
    ["APP_REVISION is empty", { APP_REVISION: "" }],
    ["DB_PATH is empty", { DB_PATH: "" }],
    ["DB_PATH is absent", { DB_PATH: undefined }],
    ["DB_PATH is not a valid file path", { DB_PATH: "invalid\0path" }],
    ["GOOGLE_CLIENT_ID is absent", { GOOGLE_CLIENT_ID: undefined }],
    ["GOOGLE_CLIENT_ID is empty", { GOOGLE_CLIENT_ID: "" }],
    [
      "GOOGLE_CLIENT_SECRET_FILE is absent",
      { GOOGLE_CLIENT_SECRET_FILE: undefined },
    ],
    [
      "the secret file does not exist",
      { GOOGLE_CLIENT_SECRET_FILE: join(dir, "missing") },
    ],
    [
      "the secret file is blank",
      { GOOGLE_CLIENT_SECRET_FILE: secretFile("blank", " \n") },
    ],
    ["PUBLIC_ORIGIN is absent", { PUBLIC_ORIGIN: undefined }],
    ["PUBLIC_ORIGIN has a path", { PUBLIC_ORIGIN: "https://barbro.dev/app" }],
    [
      "PUBLIC_ORIGIN has a trailing slash",
      { PUBLIC_ORIGIN: "https://barbro.dev/" },
    ],
    [
      "PUBLIC_ORIGIN is not http or https",
      { PUBLIC_ORIGIN: "ftp://barbro.dev" },
    ],
  ])("throws ZodError if %s", (_name, overrides: EnvSource) => {
    expectInvalid(overrides);
  });

  it("reads the Google client secret from the file, trimmed", () => {
    const env = parseEnv({
      ...base,
      GOOGLE_CLIENT_SECRET_FILE: secretFile("padded", "  s3cret\n"),
    });

    expect(env.google.clientSecret).toBe("s3cret");
  });

  it("builds the Google redirect URI from PUBLIC_ORIGIN", () => {
    const env = parseEnv({ ...base, PUBLIC_ORIGIN: "http://localhost:5173" });

    expect(env.google).toMatchObject({
      clientId: "client-id",
      redirectUri: "http://localhost:5173/api/auth/google/callback",
    });
  });
});
