import { Injectable } from "@nestjs/common";
import {
  type AuthTransaction,
  IdentityProvider,
  type VerifiedIdentity,
} from "./identity-provider.js";

// Temporary stub: the openid-client adapter replaces it later in this increment.
@Injectable()
export class GoogleIdentityProvider extends IdentityProvider {
  startAuthorization(): Promise<{ url: URL; transaction: AuthTransaction }> {
    throw new Error("Not implemented");
  }

  completeAuthorization(): Promise<VerifiedIdentity> {
    throw new Error("Not implemented");
  }
}
