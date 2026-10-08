import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
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

  beforeAll(async () => {
    app = await createTestApp({ DB_PATH: ":memory:" }, undefined, fake);
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
    const start = await app.inject({
      method: "GET",
      url: "/api/auth/google/start",
    });
    const oidc = start.cookies.find((c) => c.name === "barbro_oidc");

    const res = await app.inject({
      method: "GET",
      url: "/api/auth/google/callback?code=c1&state=s1",
      cookies: { barbro_oidc: oidc?.value ?? "" },
    });

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
});
