CREATE TYPE "public"."link_preview_status" AS ENUM('ok', 'failed');--> statement-breakpoint
CREATE TYPE "public"."message_channel" AS ENUM('updates', 'chat', 'posts');--> statement-breakpoint
CREATE TYPE "public"."message_kind" AS ENUM('text', 'prompt', 'share');--> statement-breakpoint
CREATE TYPE "public"."read_place" AS ENUM('updates', 'chat', 'posts', 'feedback');--> statement-breakpoint
CREATE TABLE "challenge_bans" (
	"challenge_id" uuid NOT NULL,
	"buffer_account_id" text NOT NULL,
	"name" text,
	"user_id" uuid,
	"banned_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "challenge_bans_challenge_id_buffer_account_id_pk" PRIMARY KEY("challenge_id","buffer_account_id")
);
--> statement-breakpoint
CREATE TABLE "link_previews" (
	"url" text PRIMARY KEY NOT NULL,
	"status" "link_preview_status" NOT NULL,
	"final_url" text,
	"title" text,
	"description" text,
	"image_url" text,
	"site_name" text,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_reactions" (
	"message_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"emoji" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "message_reactions_message_id_user_id_emoji_pk" PRIMARY KEY("message_id","user_id","emoji")
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"challenge_id" uuid NOT NULL,
	"channel" "message_channel" NOT NULL,
	"kind" "message_kind" DEFAULT 'text' NOT NULL,
	"author_id" uuid,
	"body" text DEFAULT '' NOT NULL,
	"link_url" text,
	"prompt_id" uuid,
	"entry_id" uuid,
	"reply_to_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"edited_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "read_marks" (
	"participant_id" uuid NOT NULL,
	"place" "read_place" NOT NULL,
	"read_at" timestamp with time zone NOT NULL,
	CONSTRAINT "read_marks_participant_id_place_pk" PRIMARY KEY("participant_id","place")
);
--> statement-breakpoint
ALTER TABLE "challenge_prompts" ADD COLUMN "theme" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "challenge_prompts" ADD COLUMN "steps" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "challenges" ADD COLUMN "chat_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "challenges" ADD COLUMN "invite_paused" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "challenges" ADD COLUMN "community_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "challenge_bans" ADD CONSTRAINT "challenge_bans_challenge_id_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_bans" ADD CONSTRAINT "challenge_bans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_bans" ADD CONSTRAINT "challenge_bans_banned_by_users_id_fk" FOREIGN KEY ("banned_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_reactions" ADD CONSTRAINT "message_reactions_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_reactions" ADD CONSTRAINT "message_reactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_challenge_id_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_prompt_id_challenge_prompts_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."challenge_prompts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_entry_id_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_reply_to_id_messages_id_fk" FOREIGN KEY ("reply_to_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "read_marks" ADD CONSTRAINT "read_marks_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "messages_channel_time_idx" ON "messages" USING btree ("challenge_id","channel","created_at");--> statement-breakpoint
CREATE INDEX "messages_author_idx" ON "messages" USING btree ("author_id");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_prompt_once_idx" ON "messages" USING btree ("challenge_id","prompt_id") WHERE "messages"."prompt_id" is not null;