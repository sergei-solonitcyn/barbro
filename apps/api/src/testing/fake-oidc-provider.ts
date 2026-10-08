import { createHash, randomUUID } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";
import {
  type CryptoKey,
  exportJWK,
  generateKeyPair,
  type JWK,
  SignJWT,
} from "jose";

interface PendingCode {
  codeChallenge: string;
  redirectUri: string;
  claims: Record<string, unknown>;
  signingKey: CryptoKey;
}

export interface AuthorizeOptions {
  // Merged over the default id_token claims; can override iss, aud, nonce, email_verified.
  claims?: Record<string, unknown>;
  // Sign the id_token with a key that is not in the published JWKS.
  signWithForeignKey?: boolean;
}

// A minimal OpenID Provider on 127.0.0.1 for adapter tests: discovery, JWKS, token endpoint.
// It enforces what Google enforces on the token request: client secret, redirect_uri, PKCE.
export class FakeOidcProvider {
  readonly clientId = "fake-client-id";
  readonly clientSecret = "fake-client-secret";
  issuer = "";
  // Number of upcoming discovery requests to answer with 500.
  discoveryFailures = 0;

  private readonly codes = new Map<string, PendingCode>();
  private server: Server | undefined;
  private signingKey!: CryptoKey;
  private foreignKey!: CryptoKey;
  private publicJwk!: JWK;

  async start(): Promise<void> {
    const pair = await generateKeyPair("RS256");
    this.signingKey = pair.privateKey;
    this.foreignKey = (await generateKeyPair("RS256")).privateKey;
    this.publicJwk = {
      ...(await exportJWK(pair.publicKey)),
      kid: "k1",
      alg: "RS256",
      use: "sig",
    };

    const server = createServer((req, res) => {
      this.handle(req, res).catch(() =>
        this.json(res, 500, { error: "server_error" }),
      );
    });
    this.server = server;
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    this.issuer = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve, reject) =>
      this.server
        ? this.server.close((error) => (error ? reject(error) : resolve()))
        : resolve(),
    );
  }

  // Plays the user consenting at the provider; returns the query the browser brings to the callback.
  authorize(
    authorizationUrl: URL,
    options: AuthorizeOptions = {},
  ): Record<string, string> {
    const q = authorizationUrl.searchParams;
    const code = randomUUID();
    this.codes.set(code, {
      codeChallenge: q.get("code_challenge") ?? "",
      redirectUri: q.get("redirect_uri") ?? "",
      signingKey: options.signWithForeignKey
        ? this.foreignKey
        : this.signingKey,
      claims: {
        iss: this.issuer,
        aud: this.clientId,
        sub: "google-sub-1",
        email: "user@example.com",
        email_verified: true,
        nonce: q.get("nonce"),
        ...options.claims,
      },
    });
    return { code, state: q.get("state") ?? "" };
  }

  private async handle(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const url = new URL(req.url ?? "/", this.issuer);

    if (url.pathname === "/.well-known/openid-configuration") {
      if (this.discoveryFailures > 0) {
        this.discoveryFailures--;
        return this.json(res, 500, { error: "server_error" });
      }
      return this.json(res, 200, {
        issuer: this.issuer,
        authorization_endpoint: `${this.issuer}/authorize`,
        token_endpoint: `${this.issuer}/token`,
        jwks_uri: `${this.issuer}/jwks`,
        response_types_supported: ["code"],
        subject_types_supported: ["public"],
        id_token_signing_alg_values_supported: ["RS256"],
        code_challenge_methods_supported: ["S256"],
        token_endpoint_auth_methods_supported: [
          "client_secret_post",
          "client_secret_basic",
        ],
      });
    }

    if (url.pathname === "/jwks") {
      return this.json(res, 200, { keys: [this.publicJwk] });
    }

    if (url.pathname === "/token" && req.method === "POST") {
      const body = new URLSearchParams(await readBody(req));
      const pending = this.codes.get(body.get("code") ?? "");
      this.codes.delete(body.get("code") ?? "");
      const verifier = body.get("code_verifier") ?? "";
      const challenge = createHash("sha256")
        .update(verifier)
        .digest("base64url");
      if (
        body.get("grant_type") !== "authorization_code" ||
        body.get("client_id") !== this.clientId ||
        body.get("client_secret") !== this.clientSecret ||
        !pending ||
        body.get("redirect_uri") !== pending.redirectUri ||
        challenge !== pending.codeChallenge
      ) {
        return this.json(res, 400, { error: "invalid_grant" });
      }
      const idToken = await new SignJWT(pending.claims)
        .setProtectedHeader({ alg: "RS256", kid: "k1" })
        .setIssuedAt()
        .setExpirationTime("5m")
        .sign(pending.signingKey);
      return this.json(res, 200, {
        access_token: "fake-access-token",
        token_type: "Bearer",
        expires_in: 3600,
        id_token: idToken,
      });
    }

    this.json(res, 404, { error: "not_found" });
  }

  private json(res: ServerResponse, status: number, body: unknown): void {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  }
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}
