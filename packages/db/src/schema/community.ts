import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  index,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { challengePrompts, challenges, entries, participants } from "./challenges";
import { users } from "./users";

// A challenge's community: three channels of messages, emoji reactions, what each person has
// read, link previews for shared posts, and the people a host has banned.

/**
 * updates: the host's news and each day's prompt; members react but do not write.
 * chat: everyone, about anything in the challenge. posts: people share their post of the day.
 */
export const messageChannel = pgEnum("message_channel", ["updates", "chat", "posts"]);

/** text: written by a person. prompt: the day's prompt, added by Daydeck. share: a shared post. */
export const messageKind = pgEnum("message_kind", ["text", "prompt", "share"]);

export const messages = pgTable(
  "messages",
  {
    id: uuid().primaryKey().defaultRandom(),
    challengeId: uuid()
      .notNull()
      .references(() => challenges.id, { onDelete: "cascade" }),
    channel: messageChannel().notNull(),
    kind: messageKind().notNull().default("text"),
    /** Empty for the day's prompt, which Daydeck adds. Deleting an account deletes its messages. */
    authorId: uuid().references(() => users.id, { onDelete: "cascade" }),
    body: text().notNull().default(""),
    /** The first link in the message, shown as a preview card. */
    linkUrl: text(),
    /** For the day's prompt: which prompt. */
    promptId: uuid().references(() => challengePrompts.id, { onDelete: "cascade" }),
    /** For a shared post: the author's day it belongs to, if they chose one. */
    entryId: uuid().references(() => entries.id, { onDelete: "set null" }),
    replyToId: uuid().references((): AnyPgColumn => messages.id, { onDelete: "set null" }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    editedAt: timestamp({ withTimezone: true }),
  },
  (table) => [
    index("messages_channel_time_idx").on(table.challengeId, table.channel, table.createdAt),
    index("messages_author_idx").on(table.authorId),
    // Foreign keys with ON DELETE: without these, every delete upstream scans all messages.
    index("messages_reply_to_idx").on(table.replyToId).where(sql`${table.replyToId} is not null`),
    index("messages_entry_idx").on(table.entryId).where(sql`${table.entryId} is not null`),
    index("messages_prompt_idx").on(table.promptId).where(sql`${table.promptId} is not null`),
    // Each day's prompt is added once per challenge.
    uniqueIndex("messages_prompt_once_idx")
      .on(table.challengeId, table.promptId)
      .where(sql`${table.promptId} is not null`),
  ],
);

export const messageReactions = pgTable(
  "message_reactions",
  {
    messageId: uuid()
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    emoji: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.messageId, table.userId, table.emoji] }),
    // Someone's reactions, when they delete their data.
    index("message_reactions_user_idx").on(table.userId),
  ],
);

/** The places that can have unread items: the three channels and the feedback on drafts. */
export const readPlace = pgEnum("read_place", ["updates", "chat", "posts", "feedback"]);

// When each member last looked at each place, for the unread counts.
export const readMarks = pgTable(
  "read_marks",
  {
    participantId: uuid()
      .notNull()
      .references(() => participants.id, { onDelete: "cascade" }),
    place: readPlace().notNull(),
    readAt: timestamp({ withTimezone: true }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.participantId, table.place] })],
);

// Someone a host removed for good. The Buffer account is kept, so a new Daydeck account made
// with the same Buffer login still cannot join.
export const challengeBans = pgTable(
  "challenge_bans",
  {
    challengeId: uuid()
      .notNull()
      .references(() => challenges.id, { onDelete: "cascade" }),
    bufferAccountId: text().notNull(),
    /** Their name when banned, so the host's list still reads well after they delete data. */
    name: text(),
    userId: uuid().references(() => users.id, { onDelete: "set null" }),
    bannedBy: uuid().references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.challengeId, table.bufferAccountId] }),
    index("challenge_bans_user_idx").on(table.userId).where(sql`${table.userId} is not null`),
    index("challenge_bans_banned_by_idx")
      .on(table.bannedBy)
      .where(sql`${table.bannedBy} is not null`),
  ],
);

export const linkPreviewStatus = pgEnum("link_preview_status", ["ok", "failed"]);

// What a shared link shows: its page title, text and image, read once from the page itself.
export const linkPreviews = pgTable(
  "link_previews",
  {
    url: text().primaryKey(),
    status: linkPreviewStatus().notNull(),
    finalUrl: text(),
    title: text(),
    description: text(),
    imageUrl: text(),
    siteName: text(),
    fetchedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  // The daily purge deletes previews older than a week.
  (table) => [index("link_previews_fetched_idx").on(table.fetchedAt)],
);

export type Message = typeof messages.$inferSelect;
export type MessageReaction = typeof messageReactions.$inferSelect;
export type ChallengeBan = typeof challengeBans.$inferSelect;
export type LinkPreviewRow = typeof linkPreviews.$inferSelect;
