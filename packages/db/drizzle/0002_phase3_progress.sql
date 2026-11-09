CREATE TYPE "public"."alert_kind" AS ENUM('failed_post', 'channel_disconnected', 'queue_paused', 'needs_reconnect');--> statement-breakpoint
CREATE TYPE "public"."post_match_kind" AS ENUM('app', 'auto', 'suggested', 'none', 'manual', 'rejected');--> statement-breakpoint
CREATE TABLE "alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"participant_id" uuid NOT NULL,
	"kind" "alert_kind" NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"dedupe_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone,
	CONSTRAINT "alerts_dedupeKey_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
CREATE TABLE "seen_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"participant_id" uuid NOT NULL,
	"buffer_post_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"status" text NOT NULL,
	"text_hash" text NOT NULL,
	"match_kind" "post_match_kind" NOT NULL,
	"entry_id" uuid,
	"suggested_entry_id" uuid,
	"confidence" real,
	"due_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"external_link" text,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "seen_posts_participantId_bufferPostId_unique" UNIQUE("participant_id","buffer_post_id")
);
--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seen_posts" ADD CONSTRAINT "seen_posts_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seen_posts" ADD CONSTRAINT "seen_posts_entry_id_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seen_posts" ADD CONSTRAINT "seen_posts_suggested_entry_id_entries_id_fk" FOREIGN KEY ("suggested_entry_id") REFERENCES "public"."entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "alerts_participant_id_read_at_index" ON "alerts" USING btree ("participant_id","read_at");--> statement-breakpoint
CREATE INDEX "seen_posts_participant_id_match_kind_index" ON "seen_posts" USING btree ("participant_id","match_kind");