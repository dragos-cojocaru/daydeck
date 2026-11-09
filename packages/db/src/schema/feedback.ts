import { index, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { entries, participants } from "./challenges";

/** open: the group can reply. closed: the person who asked has finished with it. */
export const feedbackRequestStatus = pgEnum("feedback_request_status", ["open", "closed"]);

// A participant asks the group for feedback on one draft. The draft text is kept as it was
// when they asked: the one piece of post text Daydeck stores, because they chose to share it.
export const feedbackRequests = pgTable(
  "feedback_requests",
  {
    id: uuid().primaryKey().defaultRandom(),
    entryId: uuid()
      .notNull()
      .references(() => entries.id, { onDelete: "cascade" }),
    requesterId: uuid()
      .notNull()
      .references(() => participants.id, { onDelete: "cascade" }),
    bufferPostId: text().notNull(),
    draftSnapshot: text().notNull(),
    status: feedbackRequestStatus().notNull().default("open"),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  // Looked up by day ("asked already?") and by person (replies to your requests); both cascade.
  (table) => [
    index("feedback_requests_entry_idx").on(table.entryId),
    index("feedback_requests_requester_idx").on(table.requesterId),
  ],
);

/**
 * pending: waiting to be written to Buffer. written: saved as a Buffer Note on the draft.
 * copy: Notes are off or failed, so the person who asked copies it into Buffer by hand.
 */
export const feedbackNoteStatus = pgEnum("feedback_note_status", ["pending", "written", "copy"]);

// One reply from someone in the group. With Buffer Notes on, it is also saved as a Note on
// the draft in the asker's Buffer.
export const feedbackItems = pgTable(
  "feedback_items",
  {
    id: uuid().primaryKey().defaultRandom(),
    requestId: uuid()
      .notNull()
      .references(() => feedbackRequests.id, { onDelete: "cascade" }),
    authorId: uuid()
      .notNull()
      .references(() => participants.id, { onDelete: "cascade" }),
    text: text().notNull(),
    noteStatus: feedbackNoteStatus().notNull().default("pending"),
    bufferNoteId: text(),
    writtenAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  // Replies of a request, and a person's replies (cascade when they leave or delete data).
  (table) => [
    index("feedback_items_request_idx").on(table.requestId),
    index("feedback_items_author_idx").on(table.authorId),
  ],
);

export type FeedbackRequest = typeof feedbackRequests.$inferSelect;
export type FeedbackItem = typeof feedbackItems.$inferSelect;
