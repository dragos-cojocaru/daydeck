import { sql } from "drizzle-orm";
import {
  check,
  index,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { entries, participants } from "./challenges";

/**
 * How a Buffer post relates to a participant's days. app: the app created it. auto: the
 * matcher was sure. suggested: the matcher asks the person to confirm. none: no prompt fits.
 * manual: the person chose the day. rejected: the person said a suggestion was wrong.
 */
export const postMatchKind = pgEnum("post_match_kind", [
  "app",
  "auto",
  "suggested",
  "none",
  "manual",
  "rejected",
]);

// Every Buffer post a check has looked at, one row per participant and post, so each post
// is matched once and again only if its text changes. The full post text is never stored: a
// hash notices an edit, and a short preview exists only while the post waits for a day.
export const seenPosts = pgTable(
  "seen_posts",
  {
    id: uuid().primaryKey().defaultRandom(),
    participantId: uuid()
      .notNull()
      .references(() => participants.id, { onDelete: "cascade" }),
    bufferPostId: text().notNull(),
    channelId: text().notNull(),
    /** Buffer's status: draft, scheduled, sending, sent, error or needs_approval. */
    status: text().notNull(),
    textHash: text().notNull(),
    matchKind: postMatchKind().notNull(),
    /** The day this post counts for, once decided. */
    entryId: uuid().references(() => entries.id, { onDelete: "set null" }),
    /** The day the matcher suggests, while it waits for the person to confirm. */
    suggestedEntryId: uuid().references(() => entries.id, { onDelete: "set null" }),
    confidence: real(),
    dueAt: timestamp({ withTimezone: true }),
    sentAt: timestamp({ withTimezone: true }),
    externalLink: text(),
    /**
     * The first 100 characters of the post, only while it waits for its day ("Check this post"
     * or "Other posts"), so the person can tell posts apart. Cleared once it has a day, when
     * the challenge closes, or after 30 days.
     */
    preview: text(),
    firstSeenAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique().on(table.participantId, table.bufferPostId),
    index().on(table.participantId, table.matchKind),
    // Both point to entries with ON DELETE SET NULL, and are empty for most rows.
    index("seen_posts_entry_idx").on(table.entryId).where(sql`${table.entryId} is not null`),
    index("seen_posts_suggested_idx")
      .on(table.suggestedEntryId)
      .where(sql`${table.suggestedEntryId} is not null`),
    check("seen_posts_preview_length_check", sql`char_length(${table.preview}) <= 100`),
  ],
);

/** failed_post: Buffer could not publish. The others warn about a channel or the connection. */
export const alertKind = pgEnum("alert_kind", [
  "failed_post",
  "channel_disconnected",
  "queue_paused",
  "needs_reconnect",
]);

// Problems to show a participant, each with one fix. The dedupe key keeps a problem from
// being raised twice, for example once per post or once per channel per day.
export const alerts = pgTable(
  "alerts",
  {
    id: uuid().primaryKey().defaultRandom(),
    participantId: uuid()
      .notNull()
      .references(() => participants.id, { onDelete: "cascade" }),
    kind: alertKind().notNull(),
    payload: jsonb().$type<AlertPayload>().notNull().default(sql`'{}'::jsonb`),
    dedupeKey: text().notNull().unique(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    readAt: timestamp({ withTimezone: true }),
  },
  (table) => [index().on(table.participantId, table.readAt)],
);

/** What an alert shows. Buffer's own error text and help link come with a failed post. */
export interface AlertPayload {
  postId?: string;
  channelId?: string;
  channelName?: string;
  message?: string;
  supportUrl?: string | null;
}

export type SeenPost = typeof seenPosts.$inferSelect;
export type Alert = typeof alerts.$inferSelect;
export type AlertKind = (typeof alertKind.enumValues)[number];
export type PostMatchKind = (typeof postMatchKind.enumValues)[number];
