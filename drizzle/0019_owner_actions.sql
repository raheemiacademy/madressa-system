CREATE TABLE "owner_action" (
	"id" serial PRIMARY KEY NOT NULL,
	"madrasah" text NOT NULL,
	"action" text NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"result" text,
	CONSTRAINT "owner_action_kind" CHECK ("owner_action"."action" in ('restart', 'backup'))
);
--> statement-breakpoint
CREATE TABLE "owner_madrasah_note" (
	"madrasah" text PRIMARY KEY NOT NULL,
	"notes" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
