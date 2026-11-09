CREATE TYPE "public"."connection_status" AS ENUM('active', 'needs_reconnect', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."reconnect_reason" AS ENUM('invalid_grant', 'insufficient_scope', 'unauthorized');--> statement-breakpoint
CREATE TABLE "buffer_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"organization_id" text NOT NULL,
	"access_token_enc" text NOT NULL,
	"refresh_token_enc" text NOT NULL,
	"key_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"scopes" text[] NOT NULL,
	"status" "connection_status" DEFAULT 'active' NOT NULL,
	"reconnect_reason" "reconnect_reason",
	"granted_at" timestamp with time zone NOT NULL,
	"refreshed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "buffer_connections_userId_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "channels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"buffer_channel_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"service" text NOT NULL,
	"name" text NOT NULL,
	"display_name" text,
	"avatar_url" text,
	"timezone" text NOT NULL,
	"is_disconnected" boolean DEFAULT false NOT NULL,
	"is_queue_paused" boolean DEFAULT false NOT NULL,
	"is_locked" boolean DEFAULT false NOT NULL,
	"posting_schedule" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"selected" boolean DEFAULT false NOT NULL,
	"synced_at" timestamp with time zone NOT NULL,
	CONSTRAINT "channels_userId_bufferChannelId_unique" UNIQUE("user_id","buffer_channel_id")
);
--> statement-breakpoint
CREATE TABLE "rate_limit_snapshots" (
	"window_seconds" integer PRIMARY KEY NOT NULL,
	"quota" integer NOT NULL,
	"remaining" integer NOT NULL,
	"reset_at" timestamp with time zone NOT NULL,
	"captured_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id_hash" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"buffer_account_id" text NOT NULL,
	"name" text,
	"email" text,
	"avatar_url" text,
	"timezone" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_bufferAccountId_unique" UNIQUE("buffer_account_id")
);
--> statement-breakpoint
ALTER TABLE "buffer_connections" ADD CONSTRAINT "buffer_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channels" ADD CONSTRAINT "channels_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sessions_user_id_index" ON "sessions" USING btree ("user_id");