import { pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * - active: tokens work.
 * - needs_reconnect: Buffer refused the grant or a scope is missing; the person must connect again.
 * - revoked: the person disconnected.
 */
export const connectionStatus = pgEnum("connection_status", [
  "active",
  "needs_reconnect",
  "revoked",
]);

/** Why a connection needs the person to connect again. Shown in the reconnect banner. */
export const reconnectReason = pgEnum("reconnect_reason", [
  "invalid_grant",
  "insufficient_scope",
  "unauthorized",
]);

// The Buffer OAuth grant for one user. Tokens are encrypted with AES-256-GCM (see the web
// app's token vault). The row is locked with SELECT ... FOR UPDATE while a refresh runs,
// because Buffer rotates refresh tokens and revokes the whole grant if an old one is reused.
export const bufferConnections = pgTable("buffer_connections", {
  id: uuid().primaryKey().defaultRandom(),
  userId: uuid()
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  /** The Buffer organization whose channels the app reads. */
  organizationId: text().notNull(),
  accessTokenEnc: text().notNull(),
  refreshTokenEnc: text().notNull(),
  /** Which encryption key sealed the tokens, so the key can be rotated later. */
  keyId: text().notNull(),
  /** When the access token stops working. */
  expiresAt: timestamp({ withTimezone: true }).notNull(),
  scopes: text().array().notNull(),
  status: connectionStatus().notNull().default("active"),
  reconnectReason: reconnectReason(),
  /** When the person approved this grant. Buffer ends every grant one year after approval. */
  grantedAt: timestamp({ withTimezone: true }).notNull(),
  refreshedAt: timestamp({ withTimezone: true }),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type BufferConnection = typeof bufferConnections.$inferSelect;
