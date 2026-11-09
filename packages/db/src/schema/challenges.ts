import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./users";

/** daily: a prompt every day. weekdays: Monday to Friday only. */
export const challengeCadence = pgEnum("challenge_cadence", ["daily", "weekdays"]);

/** fixed: everyone starts on the same date. rolling: each person's day 1 is the day they join. */
export const challengeStartMode = pgEnum("challenge_start_mode", ["fixed", "rolling"]);

/** private: only members see the board. public: anyone with the link sees opted-in progress. */
export const challengeVisibility = pgEnum("challenge_visibility", ["private", "public"]);

export const challengeStatus = pgEnum("challenge_status", ["open", "closed"]);

export const challenges = pgTable(
  "challenges",
  {
    id: uuid().primaryKey().defaultRandom(),
    /** Readable and unique, used in URLs: "five-day-kickstart-k3f9". */
    slug: text().notNull().unique(),
    hostUserId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text().notNull(),
    cadence: challengeCadence().notNull(),
    startMode: challengeStartMode().notNull(),
    /** Local date in the challenge's time zone. For rolling challenges, the day joining opens. */
    startDate: date({ mode: "string" }).notNull(),
    /** IANA time zone, such as "Europe/Bucharest". Day boundaries of fixed challenges use it. */
    timezone: text().notNull(),
    visibility: challengeVisibility().notNull().default("private"),
    /** Buffer services whose posts count, such as "linkedin". Empty means every network counts. */
    allowedServices: text().array().notNull().default(sql`'{}'::text[]`),
    /** Group chat and shared posts. Updates from the host and feedback on drafts stay on. */
    chatEnabled: boolean().notNull().default(true),
    /** While paused, the invite link shows a notice instead of the join form. */
    invitePaused: boolean().notNull().default(false),
    /**
     * The host agrees to list this challenge on Daydeck's homepage while it is very active
     * (public, open, busy: see apps/web/server/home/popular.ts). Off unless they choose it.
     */
    showOnHome: boolean().notNull().default(false),
    /** Goes up on every message, reaction or removal, so pages can ask "anything new?". */
    communityVersion: integer().notNull().default(0),
    /** 128 random bits, base64url. Knowing it is what lets someone join. */
    inviteCode: text().notNull().unique(),
    /** The tag every challenge post gets in Buffer, so it shows up in Buffer's tag analytics. */
    tagName: text().notNull(),
    status: challengeStatus().notNull().default("open"),
    /** Set for fixed challenges: the end of the last prompt's day. */
    endsAt: timestamp({ withTimezone: true }),
    /** When the challenge closed. Its data is deleted 30 days later. */
    closedAt: timestamp({ withTimezone: true }),
    /** Goes up on every progress change, so a board can ask "anything new since version N?". */
    boardVersion: integer().notNull().default(0),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    // Deleting a user cascades to the challenges they host.
    index("challenges_host_idx").on(table.hostUserId),
    // The daily jobs: close open fixed challenges after their end, purge closed ones.
    index("challenges_open_ends_idx").on(table.endsAt).where(sql`${table.status} = 'open'`),
    index("challenges_closed_at_idx").on(table.closedAt).where(sql`${table.status} = 'closed'`),
    // The homepage's "Popular challenges" reads only the few challenges whose host opted in.
    index("challenges_on_home_idx").on(table.id).where(sql`${table.showOnHome}`),
    // Never listed on the homepage unless public, open and joinable: no private or paused leaks.
    check(
      "challenges_show_on_home_check",
      sql`not ${table.showOnHome} or (${table.visibility} = 'public' and ${table.status} = 'open' and not ${table.invitePaused})`,
    ),
  ],
);

// The challenge's own copy of its prompts.
export const challengePrompts = pgTable(
  "challenge_prompts",
  {
    id: uuid().primaryKey().defaultRandom(),
    challengeId: uuid()
      .notNull()
      .references(() => challenges.id, { onDelete: "cascade" }),
    /** Day 1 is index 0. */
    dayIndex: integer().notNull(),
    title: text().notNull(),
    description: text().notNull().default(""),
    body: text().notNull().default(""),
    emoji: text().notNull().default(""),
    /** A short label over the day, such as the week's theme ("Consistency"). */
    theme: text().notNull().default(""),
    /** What to do, as short steps shown in a list. */
    steps: text().array().notNull().default(sql`'{}'::text[]`),
    bufferTemplateId: text(),
  },
  (table) => [unique().on(table.challengeId, table.dayIndex)],
);

export const participantRole = pgEnum("participant_role", ["host", "participant"]);
export const participantStatus = pgEnum("participant_status", ["active", "left"]);

export const participants = pgTable(
  "participants",
  {
    id: uuid().primaryKey().defaultRandom(),
    challengeId: uuid()
      .notNull()
      .references(() => challenges.id, { onDelete: "cascade" }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: participantRole().notNull().default("participant"),
    joinedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    /** The local date of this person's day 1 (before skipping a weekend, for weekday challenges). */
    dayOne: date({ mode: "string" }).notNull(),
    /** IANA time zone for this person's day boundaries in rolling challenges. */
    timezone: text().notNull(),
    /** Buffer channel IDs whose posts count for this challenge. */
    channelIds: text().array().notNull().default(sql`'{}'::text[]`),
    /** Agreed to show their posts on the public recap. */
    wallOptIn: boolean().notNull().default(false),
    pauseDates: date({ mode: "string" }).array().notNull().default(sql`'{}'::date[]`),
    /** The challenge tag in this person's Buffer organization, once created. */
    bufferTagId: text(),
    lastCheckedAt: timestamp({ withTimezone: true }),
    checkCursor: timestamp({ withTimezone: true }),
    status: participantStatus().notNull().default("active"),
    /**
     * Community notifications this person turned off here: "all", or places such as "chat".
     * They leave the bell and the sidebar; the challenge's own Community still shows them.
     */
    mutedPlaces: text().array().notNull().default(sql`'{}'::text[]`),
  },
  // The unique index starts with challenge_id, so it also serves "everyone in a challenge".
  (table) => [
    unique().on(table.challengeId, table.userId),
    index("participants_active_checked_idx")
      .on(table.lastCheckedAt)
      .where(sql`${table.status} = 'active'`),
    // "Your challenges", the sidebar and the live stream (every second per open tab) all look
    // people up by user; this also serves the cascade when someone deletes their data.
    index("participants_user_status_idx").on(table.userId, table.status),
    check(
      "participants_muted_places_check",
      sql`${table.mutedPlaces} <@ array['all', 'updates', 'chat', 'posts', 'feedback']::text[]`,
    ),
  ],
);

/**
 * open: nothing yet. saved: a draft or idea is in Buffer. planned: scheduled in Buffer.
 * done: sent on its day. caught_up: sent later. missed: the day passed. paused: a pause day.
 */
export const entryState = pgEnum("entry_state", [
  "open",
  "saved",
  "planned",
  "done",
  "caught_up",
  "missed",
  "paused",
]);

/** app: the app created the post. matcher: matched automatically. manual: the person chose. */
export const matchSource = pgEnum("match_source", ["app", "matcher", "manual"]);

// One row per participant and prompt: the progress of that day.
export const entries = pgTable(
  "entries",
  {
    id: uuid().primaryKey().defaultRandom(),
    participantId: uuid()
      .notNull()
      .references(() => participants.id, { onDelete: "cascade" }),
    challengePromptId: uuid()
      .notNull()
      .references(() => challengePrompts.id, { onDelete: "cascade" }),
    /** The day's combined state, from its posts in entry_posts (and its idea). */
    state: entryState().notNull().default("open"),
    /** An idea saved to Buffer for this day. Ideas belong to no channel. */
    bufferIdeaId: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    unique().on(table.participantId, table.challengePromptId),
    index().on(table.participantId, table.state),
    // Deleting a challenge's prompts cascades here.
    index("entries_prompt_idx").on(table.challengePromptId),
  ],
);

/**
 * The Buffer posts that answer a day: at most one per channel, so a day can go out on several
 * networks at once. A Buffer post counts in one challenge only, which the unique post ID makes
 * sure of: the challenge that records it first keeps it.
 */
export const entryPosts = pgTable(
  "entry_posts",
  {
    id: uuid().primaryKey().defaultRandom(),
    entryId: uuid()
      .notNull()
      .references(() => entries.id, { onDelete: "cascade" }),
    /** The Buffer channel the post is on. */
    channelId: text().notNull(),
    bufferPostId: text().notNull().unique(),
    /** Buffer's status: draft, needs_approval, scheduled, sending, sent or error. */
    status: text().notNull().default("draft"),
    matchSource: matchSource().notNull().default("app"),
    matchConfidence: real(),
    confirmedByUser: boolean().notNull().default(false),
    dueAt: timestamp({ withTimezone: true }),
    sentAt: timestamp({ withTimezone: true }),
    externalLink: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [unique().on(table.entryId, table.channelId)],
);

export type Challenge = typeof challenges.$inferSelect;
export type ChallengePrompt = typeof challengePrompts.$inferSelect;
export type Participant = typeof participants.$inferSelect;
export type Entry = typeof entries.$inferSelect;
export type EntryPost = typeof entryPosts.$inferSelect;
export type EntryState = (typeof entryState.enumValues)[number];
