CREATE INDEX "challenges_host_idx" ON "challenges" USING btree ("host_user_id");--> statement-breakpoint
CREATE INDEX "challenges_open_ends_idx" ON "challenges" USING btree ("ends_at") WHERE "challenges"."status" = 'open';--> statement-breakpoint
CREATE INDEX "challenges_closed_at_idx" ON "challenges" USING btree ("closed_at") WHERE "challenges"."status" = 'closed';--> statement-breakpoint
CREATE INDEX "entries_prompt_idx" ON "entries" USING btree ("challenge_prompt_id");--> statement-breakpoint
CREATE INDEX "participants_user_status_idx" ON "participants" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "challenge_bans_user_idx" ON "challenge_bans" USING btree ("user_id") WHERE "challenge_bans"."user_id" is not null;--> statement-breakpoint
CREATE INDEX "challenge_bans_banned_by_idx" ON "challenge_bans" USING btree ("banned_by") WHERE "challenge_bans"."banned_by" is not null;--> statement-breakpoint
CREATE INDEX "link_previews_fetched_idx" ON "link_previews" USING btree ("fetched_at");--> statement-breakpoint
CREATE INDEX "message_reactions_user_idx" ON "message_reactions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "messages_reply_to_idx" ON "messages" USING btree ("reply_to_id") WHERE "messages"."reply_to_id" is not null;--> statement-breakpoint
CREATE INDEX "messages_entry_idx" ON "messages" USING btree ("entry_id") WHERE "messages"."entry_id" is not null;--> statement-breakpoint
CREATE INDEX "messages_prompt_idx" ON "messages" USING btree ("prompt_id") WHERE "messages"."prompt_id" is not null;--> statement-breakpoint
CREATE INDEX "endpoint_hits_window_idx" ON "endpoint_hits" USING btree ("window_start");--> statement-breakpoint
CREATE INDEX "feedback_items_request_idx" ON "feedback_items" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "feedback_items_author_idx" ON "feedback_items" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "feedback_requests_entry_idx" ON "feedback_requests" USING btree ("entry_id");--> statement-breakpoint
CREATE INDEX "feedback_requests_requester_idx" ON "feedback_requests" USING btree ("requester_id");--> statement-breakpoint
CREATE INDEX "seen_posts_entry_idx" ON "seen_posts" USING btree ("entry_id") WHERE "seen_posts"."entry_id" is not null;--> statement-breakpoint
CREATE INDEX "seen_posts_suggested_idx" ON "seen_posts" USING btree ("suggested_entry_id") WHERE "seen_posts"."suggested_entry_id" is not null;--> statement-breakpoint
CREATE INDEX "sessions_expires_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_muted_places_check" CHECK ("participants"."muted_places" <@ array['all', 'updates', 'chat', 'posts', 'feedback']::text[]);