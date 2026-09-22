DROP INDEX "users_created_at_desc_idx";--> statement-breakpoint
CREATE INDEX "users_created_at_id_idx" ON "users" USING btree ("created_at" DESC,"id");