CREATE TABLE "onboarding" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"skipped" text[] DEFAULT '{}'::text[] NOT NULL,
	"hidden_at" timestamp with time zone,
	"invited_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "onboarding_one" CHECK ("onboarding"."id" = 1)
);
