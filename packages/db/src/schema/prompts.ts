import { integer, pgEnum, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * - starter: written by Daydeck and seeded with the migrations.
 * - buffer_template: copied from Buffer's public template library.
 * - host: written by a challenge host.
 */
export const promptSetSource = pgEnum("prompt_set_source", ["starter", "buffer_template", "host"]);

export const promptSetVisibility = pgEnum("prompt_set_visibility", ["public", "private"]);

// A reusable list of prompts. Challenges copy the prompts they use (see challenge_prompts), so
// editing a set never changes a running challenge.
export const promptSets = pgTable("prompt_sets", {
  id: uuid().primaryKey().defaultRandom(),
  /** Stable key for seeded and cached sets, such as "starter-five-day-kickstart". */
  slug: text().unique(),
  title: text().notNull(),
  description: text().notNull().default(""),
  source: promptSetSource().notNull(),
  createdBy: uuid().references(() => users.id, { onDelete: "set null" }),
  visibility: promptSetVisibility().notNull().default("public"),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const prompts = pgTable(
  "prompts",
  {
    id: uuid().primaryKey().defaultRandom(),
    promptSetId: uuid()
      .notNull()
      .references(() => promptSets.id, { onDelete: "cascade" }),
    /** Order within the set, from 0. */
    position: integer().notNull(),
    title: text().notNull(),
    /** One or two sentences that explain the prompt. */
    description: text().notNull().default(""),
    /** The starting text for the draft in Buffer. */
    body: text().notNull().default(""),
    emoji: text().notNull().default(""),
    /** Set when the prompt was copied from a Buffer template. */
    bufferTemplateId: text(),
  },
  (table) => [unique().on(table.promptSetId, table.position)],
);

export type PromptSet = typeof promptSets.$inferSelect;
export type Prompt = typeof prompts.$inferSelect;
