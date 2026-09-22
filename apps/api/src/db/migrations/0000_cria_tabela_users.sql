-- pg_trgm é pré-requisito dos índices GIN de busca parcial criados mais abaixo.
-- O drizzle-kit não gera extensões a partir do schema, então esta linha é
-- escrita à mão e precisa permanecer ANTES dos CREATE INDEX ... gin_trgm_ops.
-- Se esta migration for regerada, reaplicar esta edição.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_lower_unique" ON "users" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "users_name_trgm_idx" ON "users" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "users_email_trgm_idx" ON "users" USING gin ("email" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "users_created_at_desc_idx" ON "users" USING btree ("created_at" DESC NULLS LAST);