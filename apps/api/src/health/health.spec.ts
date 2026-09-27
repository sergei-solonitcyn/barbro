import { NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp } from "../testing/create-test-app.js";

describe("GET /api/health", () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  it("should respond 200 with status ok", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/health",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
  });

  it("should ignore trailing slashes", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/health/",
    });
    expect(res.statusCode).toBe(200);
  });

  it("should return a 404 without the prefix", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/health",
    });
    expect(res.statusCode).toBe(404);
  });
});
