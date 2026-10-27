CREATE TABLE "lead" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"signup_id" integer,
	"name" text,
	"email" text,
	"school" text,
	"topic" text,
	"message" text,
	"status" text DEFAULT 'New' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lead_kind" CHECK (("lead"."kind" = 'early_access' and "lead"."signup_id" is not null) or ("lead"."kind" = 'contact' and "lead"."signup_id" is null and "lead"."email" is not null)),
	CONSTRAINT "lead_status" CHECK ("lead"."status" in ('New', 'Contacted', 'Set up', 'Not interested'))
);
--> statement-breakpoint
ALTER TABLE "lead" ADD CONSTRAINT "lead_signup_id_early_access_signup_id_fk" FOREIGN KEY ("signup_id") REFERENCES "public"."early_access_signup"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lead_created_idx" ON "lead" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "lead_signup_uq" ON "lead" USING btree ("signup_id");--> statement-breakpoint
-- Past leads move in (approved): every early-access sign-up, and every contact message the mail queue kept.
INSERT INTO "lead" ("kind", "signup_id", "created_at", "updated_at")
SELECT 'early_access', "id", "created_at", "created_at" FROM "early_access_signup" ORDER BY "id";
--> statement-breakpoint
CREATE FUNCTION pg_temp.lead_unescape(t text) RETURNS text LANGUAGE sql AS $$
  SELECT replace(replace(replace(replace(replace(t, '&#60;', '<'), '&#62;', '>'), '&#34;', '"'), '&#39;', ''''), '&#38;', '&')
$$;
--> statement-breakpoint
INSERT INTO "lead" ("kind", "name", "email", "school", "topic", "message", "created_at", "updated_at")
SELECT 'contact',
  pg_temp.lead_unescape(substring("html" from '<th align="left">Name</th><td>(.*?)</td>')),
  lower("reply_to"),
  nullif(pg_temp.lead_unescape(substring("html" from '<th align="left">Madressa or school</th><td>(.*?)</td>')), 'Not given'),
  pg_temp.lead_unescape(substring("html" from '<th align="left">About</th><td>(.*?)</td>')),
  pg_temp.lead_unescape(substring("html" from '<p style="white-space:pre-wrap">(.*)</p>$')),
  "created_at", "created_at"
FROM "mail_queue" WHERE "entity" = 'contact_message' AND "reply_to" IS NOT NULL ORDER BY "id";
