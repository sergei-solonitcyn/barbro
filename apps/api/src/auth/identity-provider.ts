export interface AuthTransaction {
  state: string;
  nonce: string;
  codeVerifier: string;
}

export interface VerifiedIdentity {
  subject: string;
  email: string;
  emailVerified: boolean;
}

export abstract class IdentityProvider {
  abstract startAuthorization(): Promise<{
    url: URL;
    transaction: AuthTransaction;
  }>;

  abstract completeAuthorization(
    params: Record<string, string>,
    transaction: AuthTransaction,
  ): Promise<VerifiedIdentity>;
}
