CREATE TABLE "early_access_signup" (
	"id" serial PRIMARY KEY NOT NULL,
	"school" text NOT NULL,
	"name" text NOT NULL,
	"role" text NOT NULL,
	"email" text NOT NULL,
	"students" integer,
	"type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "early_access_signup_created_idx" ON "early_access_signup" USING btree ("created_at");