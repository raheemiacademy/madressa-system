CREATE TABLE "owner_alert" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"key" text NOT NULL,
	"about" text NOT NULL,
	"title" text NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cleared_at" timestamp with time zone,
	"channels" text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "owner_alert_open_uq" ON "owner_alert" USING btree ("key") WHERE "owner_alert"."cleared_at" is null;