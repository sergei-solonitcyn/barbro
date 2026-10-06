import { type NestFastifyApplication } from "@nestjs/platform-fastify";
import type Database from "better-sqlite3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SQLITE } from "../database.module.js";
import { createTestApp } from "../testing/create-test-app.js";

describe("GET /api/health", () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await createTestApp({
      APP_REVISION: "abc123",
      DB_PATH: ":memory:",
    });
  });

  afterAll(async () => {
    await app?.close();
  });

  it("responds 200 with DB status and revision", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/health",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      db: "ok",
      revision: "abc123",
    });
  });

  it("ignores trailing slashes", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/health/",
    });
    expect(res.statusCode).toBe(200);
  });

  it("returns a 404 without the prefix", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/health",
    });
    expect(res.statusCode).toBe(404);
  });

  it("returns an error if the database is not available", async () => {
    app.get<Database.Database>(SQLITE).close();
    const res = await app.inject({
      method: "GET",
      url: "/api/health",
    });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({
      db: "error",
      revision: "abc123",
    });
  });
});
