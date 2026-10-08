import { createHash } from "node:crypto";
import * as client from "openid-client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FakeOidcProvider } from "../testing/fake-oidc-provider.js";
import { GoogleIdentityProvider } from "./google-identity-provider.js";

const REDIRECT_URI = "http://localhost:5173/api/auth/google/callback";

describe("GoogleIdentityProvider against a local OpenID Provider", () => {
  const idp = new FakeOidcProvider();

  function adapter(clientSecret = idp.clientSecret) {
    return new GoogleIdentityProvider(
      new URL(idp.issuer),
      { clientId: idp.clientId, clientSecret, redirectUri: REDIRECT_URI },
      { execute: [client.allowInsecureRequests] },
    );
  }

  beforeAll(async () => {
    await idp.start();
  });

  afterAll(async () => {
    await idp.stop();
  });

  it("builds the authorization URL with PKCE S256, state, nonce and the minimal scope", async () => {
    const { url, transaction } = await adapter().startAuthorization();

    expect(url.origin + url.pathname).toBe(`${idp.issuer}/authorize`);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: idp.clientId,
      redirect_uri: REDIRECT_URI,
      response_type: "code",
      scope: "openid email",
      state: transaction.state,
      nonce: transaction.nonce,
      code_challenge: createHash("sha256")
        .update(transaction.codeVerifier)
        .digest("base64url"),
      code_challenge_method: "S256",
    });
  });

  it("returns the verified identity after a valid callback", async () => {
    const provider = adapter();
    const { url, transaction } = await provider.startAuthorization();

    const identity = await provider.completeAuthorization(
      idp.authorize(url),
      transaction,
    );

    expect(identity).toEqual({
      subject: "google-sub-1",
      email: "user@example.com",
      emailVerified: true,
    });
  });

  it("passes email_verified=false through for the caller to reject", async () => {
    const provider = adapter();
    const { url, transaction } = await provider.startAuthorization();

    const identity = await provider.completeAuthorization(
      idp.authorize(url, { claims: { email_verified: false } }),
      transaction,
    );

    expect(identity.emailVerified).toBe(false);
  });

  it.each([
    ["the state does not match", {}, { state: "forged" }],
    ["the nonce does not match", { claims: { nonce: "other" } }, {}],
    [
      "the audience is another client",
      { claims: { aud: "another-client" } },
      {},
    ],
    ["the issuer is wrong", { claims: { iss: "https://evil.example" } }, {}],
    [
      "the id_token is signed by an unknown key",
      { signWithForeignKey: true },
      {},
    ],
    ["the id_token has no email", { claims: { email: undefined } }, {}],
  ])("rejects when %s", async (_name, authorizeOptions, paramOverrides) => {
    const provider = adapter();
    const { url, transaction } = await provider.startAuthorization();
    const params = {
      ...idp.authorize(url, authorizeOptions),
      ...paramOverrides,
    };

    await expect(
      provider.completeAuthorization(params, transaction),
    ).rejects.toThrow();
  });

  it("rejects a wrong PKCE verifier", async () => {
    const provider = adapter();
    const { url, transaction } = await provider.startAuthorization();

    await expect(
      provider.completeAuthorization(idp.authorize(url), {
        ...transaction,
        codeVerifier: "x".repeat(43),
      }),
    ).rejects.toThrow();
  });

  it("rejects when the client secret is wrong", async () => {
    const provider = adapter("wrong-secret");
    const { url, transaction } = await provider.startAuthorization();

    await expect(
      provider.completeAuthorization(idp.authorize(url), transaction),
    ).rejects.toThrow();
  });

  it("retries discovery after a failure", async () => {
    const provider = adapter();
    idp.discoveryFailures = 1;

    await expect(provider.startAuthorization()).rejects.toThrow();
    await expect(provider.startAuthorization()).resolves.toMatchObject({
      url: expect.any(URL),
    });
  });

  it("refuses a plain-HTTP issuer without the test-only option", async () => {
    const provider = new GoogleIdentityProvider(new URL(idp.issuer), {
      clientId: idp.clientId,
      clientSecret: idp.clientSecret,
      redirectUri: REDIRECT_URI,
    });

    await expect(provider.startAuthorization()).rejects.toThrow();
  });
});
