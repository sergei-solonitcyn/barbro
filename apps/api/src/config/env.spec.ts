import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { parseEnv } from "./env.js";

describe("parseEnv", () => {
  it("returns correct defaults", () => {
    const env = parseEnv({});

    expect(env.host).toBe("127.0.0.1");
    expect(env.port).toBe(3000);
  });

  it("returns correct values", () => {
    const env = parseEnv({
      APP_REVISION: "abc123",
      HOST: "0.0.0.0",
      PORT: "8080",
    });

    expect(env.host).toBe("0.0.0.0");
    expect(env.port).toBe(8080);
    expect(env.revision).toBe("abc123");
  });

  it("throws ZodError if HOST is empty", () => {
    expect(() => {
      parseEnv({
        HOST: "",
      });
    }).toThrow(ZodError);
  });

  it("throws ZodError if HOST is not a valid IP address", () => {
    expect(() => {
      parseEnv({
        HOST: "192.168.1.256",
      });
    }).toThrow(ZodError);
  });

  it("throws ZodError if PORT is invalid", () => {
    expect(() => {
      parseEnv({
        PORT: "invalid",
      });
    }).toThrow(ZodError);
  });

  it("throws ZodError if PORT is empty", () => {
    expect(() => {
      parseEnv({
        PORT: "",
      });
    }).toThrow(ZodError);
  });

  it("throws ZodError if PORT is not an int number", () => {
    expect(() => {
      parseEnv({
        PORT: "3000.5",
      });
    }).toThrow(ZodError);
  });

  it("throws ZodError if PORT is less than 1", () => {
    expect(() => {
      parseEnv({
        PORT: "0",
      });
    }).toThrow(ZodError);
  });

  it("throws ZodError if PORT is greater than 65535", () => {
    expect(() => {
      parseEnv({
        PORT: "65536",
      });
    }).toThrow(ZodError);
  });

  it("returns 'revision' as default 'dev' if absent", () => {
    const env = parseEnv({});
    expect(env.revision).toBe("dev");
  });

  it("throws ZodError if APP_REVISION is empty", () => {
    expect(() => {
      parseEnv({
        APP_REVISION: "",
      });
    }).toThrow(ZodError);
  });
});
