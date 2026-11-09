CREATE TABLE "entry_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_id" uuid NOT NULL,
	"channel_id" text NOT NULL,
	"buffer_post_id" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"match_source" "match_source" DEFAULT 'app' NOT NULL,
	"match_confidence" real,
	"confirmed_by_user" boolean DEFAULT false NOT NULL,
	"due_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"external_link" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entry_posts_bufferPostId_unique" UNIQUE("buffer_post_id"),
	CONSTRAINT "entry_posts_entryId_channelId_unique" UNIQUE("entry_id","channel_id")
);
--> statement-breakpoint
ALTER TABLE "entry_posts" ADD CONSTRAINT "entry_posts_entry_id_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Each day's single post moves to entry_posts; its Buffer status comes from the day's state.
INSERT INTO "entry_posts" ("entry_id", "channel_id", "buffer_post_id", "status", "match_source", "match_confidence", "confirmed_by_user", "due_at", "sent_at", "external_link")
SELECT "id", "channel_id", "buffer_post_id",
	CASE WHEN "state" IN ('done', 'caught_up') THEN 'sent' WHEN "state" = 'planned' THEN 'scheduled' ELSE 'draft' END,
	COALESCE("match_source", 'app'), "match_confidence", "confirmed_by_user", "due_at", "sent_at", "external_link"
FROM "entries"
WHERE "buffer_post_id" IS NOT NULL AND "channel_id" IS NOT NULL
ON CONFLICT DO NOTHING;--> statement-breakpoint
ALTER TABLE "entries" DROP COLUMN "buffer_post_id";--> statement-breakpoint
ALTER TABLE "entries" DROP COLUMN "channel_id";--> statement-breakpoint
ALTER TABLE "entries" DROP COLUMN "due_at";--> statement-breakpoint
ALTER TABLE "entries" DROP COLUMN "sent_at";--> statement-breakpoint
ALTER TABLE "entries" DROP COLUMN "external_link";--> statement-breakpoint
ALTER TABLE "entries" DROP COLUMN "match_source";--> statement-breakpoint
ALTER TABLE "entries" DROP COLUMN "match_confidence";--> statement-breakpoint
ALTER TABLE "entries" DROP COLUMN "confirmed_by_user";