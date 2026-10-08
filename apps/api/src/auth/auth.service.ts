import { createHash, randomBytes } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { DB_CLIENT } from "../database.module.js";
import { session, user, userIdentity } from "../db/schema.js";
import { type VerifiedIdentity } from "./identity-provider.js";

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

@Injectable()
export class AuthService {
  constructor(@Inject(DB_CLIENT) private readonly db: BetterSQLite3Database) {}

  // Returns the raw session token; only its SHA-256 is stored.
  signIn(identity: VerifiedIdentity): string {
    const token = randomBytes(32).toString("base64url");
    const now = new Date();

    this.db.transaction((tx) => {
      let userId = tx
        .select({ userId: userIdentity.userId })
        .from(userIdentity)
        .where(
          and(
            eq(userIdentity.provider, "google"),
            eq(userIdentity.subject, identity.subject),
          ),
        )
        .get()?.userId;

      if (userId === undefined) {
        userId = tx
          .insert(user)
          .values({ email: identity.email })
          .returning({ id: user.id })
          .get().id;
        tx.insert(userIdentity)
          .values({ userId, provider: "google", subject: identity.subject })
          .run();
      }

      tx.insert(session)
        .values({
          idHash: hashToken(token),
          userId,
          createdAt: now,
          expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
        })
        .run();
    });

    return token;
  }
}
