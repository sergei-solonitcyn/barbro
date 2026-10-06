import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DB_CLIENT, SQLITE } from "./database.module.js";
import { session, user, userIdentity } from "./db/schema.js";
import { createTestApp } from "./testing/create-test-app.js";

describe("Database behavior", () => {
  let app: NestFastifyApplication;

  beforeEach(async () => {
    app = await createTestApp({
      APP_REVISION: "abc123",
      DB_PATH: ":memory:",
    });
  });

  afterEach(async () => {
    await app?.close();
  });

  it("Database gracefully closes on app shutdown", async () => {
    const sqlite = app.get<Database.Database>(SQLITE);
    await app.close();
    expect(sqlite.open).toBe(false);
  });

  it("'user' table exists after the app start", () => {
    const sqlite = app.get<Database.Database>(SQLITE);
    const row = sqlite
      .prepare(
        "SELECT name FROM sqlite_schema WHERE type = 'table' AND name = 'user';",
      )
      .get();
    expect(row).toEqual({ name: "user" });
  });

  it("User Identity and User `session is deleted when the user is deleted", () => {
    const db = app.get<BetterSQLite3Database>(DB_CLIENT);
    const { id } = db
      .insert(user)
      .values({ email: "a@example.com" })
      .returning()
      .get();
    db.insert(userIdentity)
      .values({ userId: id, provider: "google", subject: "123" })
      .run();
    db.insert(session)
      .values({
        idHash: "x",
        userId: id,
        createdAt: new Date(),
        expiresAt: new Date(),
      })
      .run();

    db.delete(user).where(eq(user.id, id)).run();

    expect(db.select().from(userIdentity).all()).toEqual([]);
    expect(db.select().from(session).all()).toEqual([]);
  });
});

describe("Database file in non-existed path", () => {
  it("throws an error when the directory does not exist with corresponding message", async () => {
    await expect(async () => {
      await createTestApp({
        APP_REVISION: "abc123",
        DB_PATH: "non-existed-path/db.sqlite",
      });
    }).rejects.toThrow(/directory does not exist/);
  });
});

describe("Database file is not a valid sqlite db file", () => {
  it("throws an error when the file is not a valid db file with according message", async () => {
    const dir = mkdtempSync(join(tmpdir(), "barbro-"));
    const path = join(dir, "garbage.db");
    writeFileSync(path, Buffer.alloc(8192, 0x41));
    await expect(async () => {
      await createTestApp({
        APP_REVISION: "abc123",
        DB_PATH: path,
      });
    }).rejects.toThrow(/file is not a database/);
  });
});
