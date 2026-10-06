import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

export const user = sqliteTable("user", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  debugField: integer("debug_field"),
});

export const userIdentity = sqliteTable(
  "user_identity",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    subject: text("subject").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.provider, t.subject] }),
    index("user_identity_user_id_idx").on(t.userId),
  ],
);

export const session = sqliteTable(
  "session",
  {
    idHash: text("id_hash").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  },
  (t) => [index("session_user_id_idx").on(t.userId)],
);
