CREATE TYPE "public"."challenge_cadence" AS ENUM('daily', 'weekdays');--> statement-breakpoint
CREATE TYPE "public"."challenge_start_mode" AS ENUM('fixed', 'rolling');--> statement-breakpoint
CREATE TYPE "public"."challenge_status" AS ENUM('open', 'closed');--> statement-breakpoint
CREATE TYPE "public"."challenge_visibility" AS ENUM('private', 'public');--> statement-breakpoint
CREATE TYPE "public"."entry_state" AS ENUM('open', 'saved', 'planned', 'done', 'caught_up', 'missed', 'paused');--> statement-breakpoint
CREATE TYPE "public"."match_source" AS ENUM('app', 'matcher', 'manual');--> statement-breakpoint
CREATE TYPE "public"."participant_role" AS ENUM('host', 'participant');--> statement-breakpoint
CREATE TYPE "public"."participant_status" AS ENUM('active', 'left');--> statement-breakpoint
CREATE TYPE "public"."prompt_set_source" AS ENUM('starter', 'buffer_template', 'host');--> statement-breakpoint
CREATE TYPE "public"."prompt_set_visibility" AS ENUM('public', 'private');--> statement-breakpoint
CREATE TABLE "challenge_prompts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"challenge_id" uuid NOT NULL,
	"day_index" integer NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"emoji" text DEFAULT '' NOT NULL,
	"buffer_template_id" text,
	CONSTRAINT "challenge_prompts_challengeId_dayIndex_unique" UNIQUE("challenge_id","day_index")
);
--> statement-breakpoint
CREATE TABLE "challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"host_user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"cadence" "challenge_cadence" NOT NULL,
	"start_mode" "challenge_start_mode" NOT NULL,
	"start_date" date NOT NULL,
	"timezone" text NOT NULL,
	"visibility" "challenge_visibility" DEFAULT 'private' NOT NULL,
	"invite_code" text NOT NULL,
	"tag_name" text NOT NULL,
	"status" "challenge_status" DEFAULT 'open' NOT NULL,
	"ends_at" timestamp with time zone,
	"board_version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "challenges_slug_unique" UNIQUE("slug"),
	CONSTRAINT "challenges_inviteCode_unique" UNIQUE("invite_code")
);
--> statement-breakpoint
CREATE TABLE "entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"participant_id" uuid NOT NULL,
	"challenge_prompt_id" uuid NOT NULL,
	"state" "entry_state" DEFAULT 'open' NOT NULL,
	"buffer_post_id" text,
	"buffer_idea_id" text,
	"channel_id" text,
	"due_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"external_link" text,
	"match_source" "match_source",
	"match_confidence" real,
	"confirmed_by_user" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entries_participantId_challengePromptId_unique" UNIQUE("participant_id","challenge_prompt_id")
);
--> statement-breakpoint
CREATE TABLE "participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"challenge_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "participant_role" DEFAULT 'participant' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"day_one" date NOT NULL,
	"timezone" text NOT NULL,
	"channel_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"wall_opt_in" boolean DEFAULT false NOT NULL,
	"pause_dates" date[] DEFAULT '{}'::date[] NOT NULL,
	"buffer_tag_id" text,
	"last_checked_at" timestamp with time zone,
	"check_cursor" timestamp with time zone,
	"status" "participant_status" DEFAULT 'active' NOT NULL,
	CONSTRAINT "participants_challengeId_userId_unique" UNIQUE("challenge_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "prompt_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"source" "prompt_set_source" NOT NULL,
	"created_by" uuid,
	"visibility" "prompt_set_visibility" DEFAULT 'public' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prompt_sets_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "prompts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prompt_set_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"emoji" text DEFAULT '' NOT NULL,
	"buffer_template_id" text,
	CONSTRAINT "prompts_promptSetId_position_unique" UNIQUE("prompt_set_id","position")
);
--> statement-breakpoint
ALTER TABLE "challenge_prompts" ADD CONSTRAINT "challenge_prompts_challenge_id_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_host_user_id_users_id_fk" FOREIGN KEY ("host_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_challenge_prompt_id_challenge_prompts_id_fk" FOREIGN KEY ("challenge_prompt_id") REFERENCES "public"."challenge_prompts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_challenge_id_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_sets" ADD CONSTRAINT "prompt_sets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompts" ADD CONSTRAINT "prompts_prompt_set_id_prompt_sets_id_fk" FOREIGN KEY ("prompt_set_id") REFERENCES "public"."prompt_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "entries_participant_id_state_index" ON "entries" USING btree ("participant_id","state");--> statement-breakpoint
CREATE INDEX "participants_active_checked_idx" ON "participants" USING btree ("last_checked_at") WHERE "participants"."status" = 'active';