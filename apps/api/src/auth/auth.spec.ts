import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { LightMyRequestResponse } from "fastify";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { DB_CLIENT } from "../database.module.js";
import { session, user, userIdentity } from "../db/schema.js";
import { createTestApp } from "../testing/create-test-app.js";
import type { IdentityProvider } from "./identity-provider.js";

describe("Google sign-in", () => {
  let app: NestFastifyApplication;

  const completeAuthorization = vi.fn(async () => ({
    email: "a@b.c",
    emailVerified: true,
    subject: "subj1",
  }));

  const fake: IdentityProvider = {
    startAuthorization: async () => ({
      url: new URL("https://idp.test/authorize"),
      transaction: { codeVerifier: "v1", nonce: "n1", state: "s1" },
    }),
    completeAuthorization,
  };

  async function startCookie(): Promise<string> {
    const res = await app.inject({
      method: "GET",
      url: "/api/auth/google/start",
    });
    return res.cookies.find((c) => c.name === "barbro_oidc")?.value ?? "";
  }

  function callback(oidcCookie?: string) {
    return app.inject({
      method: "GET",
      url: "/api/auth/google/callback?code=c1&state=s1",
      cookies: oidcCookie === undefined ? {} : { barbro_oidc: oidcCookie },
    });
  }

  async function signIn(): Promise<string> {
    const res = await callback(await startCookie());
    return res.cookies.find((c) => c.name === "barbro_session")?.value ?? "";
  }

  function me(sessionCookie?: string) {
    return app.inject({
      method: "GET",
      url: "/api/me",
      cookies:
        sessionCookie === undefined ? {} : { barbro_session: sessionCookie },
    });
  }

  function logout(
    sessionCookie?: string,
    headers: Record<string, string> = { "x-requested-with": "fetch" },
  ) {
    return app.inject({
      method: "POST",
      url: "/api/auth/logout",
      headers,
      cookies:
        sessionCookie === undefined ? {} : { barbro_session: sessionCookie },
    });
  }

  function expectSignInFailed(res: LightMyRequestResponse) {
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe("/?signin=failed");
    expect(
      res.cookies.find((c) => c.name === "barbro_session"),
    ).toBeUndefined();
    expect(res.cookies.find((c) => c.name === "barbro_oidc")).toMatchObject({
      value: "",
      maxAge: 0,
      path: "/api/auth/google",
    });
  }

  beforeAll(async () => {
    app = await createTestApp({ DB_PATH: ":memory:" }, undefined, fake);
  });

  beforeEach(() => {
    completeAuthorization.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  afterAll(async () => {
    await app?.close();
  });

  it("GET /api/auth/google/start redirects to the provider and sets the transaction cookie", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/auth/google/start",
    });

    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe("https://idp.test/authorize");
    expect(res.cookies.find((c) => c.name === "barbro_oidc")).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
      path: "/api/auth/google",
      maxAge: 600,
    });
  });

  it("GET /api/auth/google/callback signs in, sets the session cookie and clears the transaction cookie", async () => {
    const res = await callback(await startCookie());

    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe("/");
    expect(completeAuthorization).toHaveBeenCalledWith(
      { code: "c1", state: "s1" },
      { codeVerifier: "v1", nonce: "n1", state: "s1" },
    );
    expect(res.cookies.find((c) => c.name === "barbro_session")).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
      path: "/",
      maxAge: 2592000,
    });
    expect(res.cookies.find((c) => c.name === "barbro_oidc")).toMatchObject({
      value: "",
      maxAge: 0,
      path: "/api/auth/google",
    });
  });

  it("callback without the transaction cookie fails without calling the provider", async () => {
    expectSignInFailed(await callback());
    expect(completeAuthorization).not.toHaveBeenCalled();
  });

  it("callback with a malformed transaction cookie fails without calling the provider", async () => {
    expectSignInFailed(await callback("not-json"));
    expectSignInFailed(await callback(JSON.stringify({ state: "s1" })));
    expect(completeAuthorization).not.toHaveBeenCalled();
  });

  it("callback fails when the provider rejects the response", async () => {
    completeAuthorization.mockRejectedValueOnce(new Error("state mismatch"));
    expectSignInFailed(await callback(await startCookie()));
  });

  it("callback with an unverified email fails and creates no user", async () => {
    completeAuthorization.mockResolvedValueOnce({
      email: "x@y.z",
      emailVerified: false,
      subject: "unverified",
    });

    expectSignInFailed(await callback(await startCookie()));

    const db = app.get<BetterSQLite3Database>(DB_CLIENT);
    expect(
      db
        .select()
        .from(userIdentity)
        .where(eq(userIdentity.subject, "unverified"))
        .all(),
    ).toEqual([]);
  });

  it("GET /api/me returns the signed-in user's email", async () => {
    const res = await me(await signIn());

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ email: "a@b.c" });
  });

  it("signing in again with the same Google account reuses the user", async () => {
    await signIn();
    await signIn();

    const db = app.get<BetterSQLite3Database>(DB_CLIENT);
    expect(
      db
        .select()
        .from(userIdentity)
        .where(eq(userIdentity.subject, "subj1"))
        .all(),
    ).toHaveLength(1);
  });

  it("GET /api/me without a session cookie returns 401", async () => {
    expect((await me()).statusCode).toBe(401);
  });

  it("GET /api/me with an unknown session token returns 401", async () => {
    expect((await me("unknown-token")).statusCode).toBe(401);
  });

  it("GET /api/me returns 401 once the session has expired", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-01T12:00:00Z"));
    const token = await signIn();

    vi.setSystemTime(new Date("2026-10-31T12:00:01Z"));

    expect((await me(token)).statusCode).toBe(401);
  });

  it("POST /api/auth/logout ends the session on the server and clears the cookie", async () => {
    const token = await signIn();

    const res = await logout(token);

    expect(res.statusCode).toBe(204);
    expect(res.cookies.find((c) => c.name === "barbro_session")).toMatchObject({
      value: "",
      maxAge: 0,
      path: "/",
    });
    expect((await me(token)).statusCode).toBe(401);
  });

  it("POST /api/auth/logout without a session still succeeds", async () => {
    expect((await logout()).statusCode).toBe(204);
  });

  it("POST /api/auth/logout without X-Requested-With is rejected and keeps the session", async () => {
    const token = await signIn();

    expect((await logout(token, {})).statusCode).toBe(403);
    expect((await me(token)).statusCode).toBe(200);
  });

  describe("account deletion", () => {
    function deleteMe(
      sessionCookie?: string,
      headers: Record<string, string> = { "x-requested-with": "fetch" },
    ) {
      return app.inject({
        method: "DELETE",
        url: "/api/me",
        headers,
        cookies:
          sessionCookie === undefined ? {} : { barbro_session: sessionCookie },
      });
    }

    async function signInAs(subject: string): Promise<string> {
      completeAuthorization.mockResolvedValueOnce({
        email: `${subject}@b.c`,
        emailVerified: true,
        subject,
      });
      return signIn();
    }

    function userIdOf(subject: string): number | undefined {
      const db = app.get<BetterSQLite3Database>(DB_CLIENT);
      return db
        .select({ userId: userIdentity.userId })
        .from(userIdentity)
        .where(eq(userIdentity.subject, subject))
        .get()?.userId;
    }

    it("DELETE /api/me deletes the user, its identities and every session, and clears the cookie", async () => {
      const token = await signInAs("del1");
      const otherDevice = await signInAs("del1");
      const userId = userIdOf("del1");
      if (userId === undefined) {
        throw new Error("sign-in created no user");
      }

      const res = await deleteMe(token);

      expect(res.statusCode).toBe(204);
      expect(
        res.cookies.find((c) => c.name === "barbro_session"),
      ).toMatchObject({
        value: "",
        maxAge: 0,
        path: "/",
      });
      const db = app.get<BetterSQLite3Database>(DB_CLIENT);
      expect(db.select().from(user).where(eq(user.id, userId)).all()).toEqual(
        [],
      );
      expect(userIdOf("del1")).toBeUndefined();
      expect(
        db.select().from(session).where(eq(session.userId, userId)).all(),
      ).toEqual([]);
      expect((await me(otherDevice)).statusCode).toBe(401);
    });

    it("keeps other users' accounts", async () => {
      const keep = await signInAs("keep1");

      expect((await deleteMe(await signInAs("del2"))).statusCode).toBe(204);

      expect((await me(keep)).statusCode).toBe(200);
    });

    it("signing in again after deletion creates a new user", async () => {
      await deleteMe(await signInAs("del3"));
      const before = userIdOf("del3");

      await signInAs("del3");

      expect(before).toBeUndefined();
      expect(userIdOf("del3")).toBeDefined();
    });

    it("without a session returns 401", async () => {
      expect((await deleteMe()).statusCode).toBe(401);
    });

    it("without X-Requested-With is rejected and keeps the account", async () => {
      const token = await signInAs("del4");

      expect((await deleteMe(token, {})).statusCode).toBe(403);
      expect((await me(token)).statusCode).toBe(200);
      expect(userIdOf("del4")).toBeDefined();
    });
  });

  describe("sliding session lifetime", () => {
    const signedInAt = new Date("2026-10-01T12:00:00Z").getTime();
    const DAY_MS = 24 * 60 * 60 * 1000;

    function at(offsetMs: number) {
      vi.setSystemTime(new Date(signedInAt + offsetMs));
    }

    function sessionCookieOf(res: LightMyRequestResponse) {
      return res.cookies.find((c) => c.name === "barbro_session");
    }

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["Date"] });
      at(0);
    });

    it("use extends the session by 30 days and re-issues the cookie", async () => {
      const token = await signIn();

      at(20 * DAY_MS);
      const res = await me(token);
      expect(res.statusCode).toBe(200);
      expect(sessionCookieOf(res)).toMatchObject({
        value: token,
        maxAge: 2592000,
        path: "/",
        httpOnly: true,
      });

      at(40 * DAY_MS);
      expect((await me(token)).statusCode).toBe(200);
    });

    it("does not renew more than once a day", async () => {
      const token = await signIn();

      at(60 * 60 * 1000);
      const res = await me(token);
      expect(res.statusCode).toBe(200);
      expect(sessionCookieOf(res)).toBeUndefined();
    });

    it("never extends past 90 days from sign-in", async () => {
      const token = await signIn();
      at(25 * DAY_MS);
      await me(token);
      at(50 * DAY_MS);
      await me(token);

      at(75 * DAY_MS);
      const res = await me(token);
      expect(sessionCookieOf(res)).toMatchObject({ maxAge: 15 * 24 * 60 * 60 });

      at(90 * DAY_MS + 1000);
      expect((await me(token)).statusCode).toBe(401);
    });
  });
});
