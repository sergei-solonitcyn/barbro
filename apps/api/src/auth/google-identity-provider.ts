import * as client from "openid-client";
import type { Env } from "../config/env.js";
import {
  type AuthTransaction,
  IdentityProvider,
  type VerifiedIdentity,
} from "./identity-provider.js";

export const GOOGLE_ISSUER = new URL("https://accounts.google.com");

// openid-client does the protocol: discovery, PKCE, state, nonce, the code exchange and the
// id_token checks (iss, aud, exp, nonce, and the signature once enabled below).
// Built by a factory in AuthModule.
export class GoogleIdentityProvider extends IdentityProvider {
  private configuration: Promise<client.Configuration> | undefined;

  constructor(
    private readonly issuer: URL,
    private readonly google: Env["google"],
    // Tests pass allowInsecureRequests for a local http issuer; production passes nothing.
    private readonly discoveryOptions?: client.DiscoveryRequestOptions,
  ) {
    super();
  }

  async startAuthorization(): Promise<{
    url: URL;
    transaction: AuthTransaction;
  }> {
    const config = await this.config();
    const transaction: AuthTransaction = {
      state: client.randomState(),
      nonce: client.randomNonce(),
      codeVerifier: client.randomPKCECodeVerifier(),
    };
    const url = client.buildAuthorizationUrl(config, {
      redirect_uri: this.google.redirectUri,
      scope: "openid email",
      state: transaction.state,
      nonce: transaction.nonce,
      code_challenge: await client.calculatePKCECodeChallenge(
        transaction.codeVerifier,
      ),
      code_challenge_method: "S256",
    });
    return { url, transaction };
  }

  async completeAuthorization(
    params: Record<string, string>,
    transaction: AuthTransaction,
  ): Promise<VerifiedIdentity> {
    const config = await this.config();
    // openid-client takes redirect_uri from this URL without its query.
    const callbackUrl = new URL(this.google.redirectUri);
    for (const [key, value] of Object.entries(params)) {
      callbackUrl.searchParams.set(key, value);
    }

    const tokens = await client.authorizationCodeGrant(config, callbackUrl, {
      expectedState: transaction.state,
      expectedNonce: transaction.nonce,
      pkceCodeVerifier: transaction.codeVerifier,
    });

    const claims = tokens.claims();
    if (!claims || typeof claims.email !== "string") {
      throw new Error("ID token has no email claim");
    }
    return {
      subject: claims.sub,
      email: claims.email,
      emailVerified: claims.email_verified === true,
    };
  }

  // Lazy, so the API starts while Google is unreachable; a failed discovery is retried next time.
  private config(): Promise<client.Configuration> {
    this.configuration ??= client
      .discovery(
        this.issuer,
        this.google.clientId,
        this.google.clientSecret,
        undefined,
        {
          ...this.discoveryOptions,
          // By default openid-client trusts TLS instead of the id_token signature (OIDC Core 3.1.3.7);
          // we verify the signature against Google's JWKS as well.
          execute: [
            client.enableNonRepudiationChecks,
            ...(this.discoveryOptions?.execute ?? []),
          ],
        },
      )
      .catch((error: unknown) => {
        this.configuration = undefined;
        throw error;
      });
    return this.configuration;
  }
}
