import { createHash, randomBytes } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { and, eq, gt } from "drizzle-orm";
import { type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { DB_CLIENT } from "../database.module.js";
import { session, user, userIdentity } from "../db/schema.js";
import { type VerifiedIdentity } from "./identity-provider.js";
import { type SessionUser } from "./session-user.js";

const DAY_MS = 24 * 60 * 60 * 1000;
export const SESSION_TTL_MS = 30 * DAY_MS;
export const SESSION_ABSOLUTE_TTL_MS = 90 * DAY_MS;
// Sliding renewal writes to the database at most once a day per session.
const RENEW_INTERVAL_MS = DAY_MS;

export interface Authenticated {
  user: SessionUser;
  // Set when the session was extended; the cookie must be re-issued with this lifetime.
  renewedMaxAgeSeconds?: number;
}

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

  signOut(token: string): void {
    this.db
      .delete(session)
      .where(eq(session.idHash, hashToken(token)))
      .run();
  }

  // Hard delete. The foreign keys cascade to user_identity and to every session of the user.
  deleteUser(userId: number): void {
    this.db.delete(user).where(eq(user.id, userId)).run();
  }

  // 30-day sliding lifetime, capped at 90 days from sign-in.
  authenticate(token: string): Authenticated | undefined {
    const now = new Date();
    const idHash = hashToken(token);
    const row = this.db
      .select({
        id: user.id,
        email: user.email,
        createdAt: session.createdAt,
        expiresAt: session.expiresAt,
      })
      .from(session)
      .innerJoin(user, eq(session.userId, user.id))
      .where(and(eq(session.idHash, idHash), gt(session.expiresAt, now)))
      .get();

    if (!row) {
      return undefined;
    }

    const sessionUser = { id: row.id, email: row.email };
    const target = Math.min(
      now.getTime() + SESSION_TTL_MS,
      row.createdAt.getTime() + SESSION_ABSOLUTE_TTL_MS,
    );
    if (target - row.expiresAt.getTime() < RENEW_INTERVAL_MS) {
      return { user: sessionUser };
    }

    this.db
      .update(session)
      .set({ expiresAt: new Date(target) })
      .where(eq(session.idHash, idHash))
      .run();
    return {
      user: sessionUser,
      renewedMaxAgeSeconds: Math.floor((target - now.getTime()) / 1000),
    };
  }
}
