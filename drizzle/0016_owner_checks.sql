CREATE TABLE "owner_check" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"madrasah" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"ok" boolean NOT NULL,
	"error" text,
	"summary" jsonb
);
--> statement-breakpoint
CREATE INDEX "owner_check_madrasah_at_idx" ON "owner_check" USING btree ("madrasah","at");