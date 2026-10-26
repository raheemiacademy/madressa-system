CREATE TABLE "push_queue" (
	"id" serial PRIMARY KEY NOT NULL,
	"identity_id" integer NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"url" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "push_queue" ADD CONSTRAINT "push_queue_identity_id_login_identity_id_fk" FOREIGN KEY ("identity_id") REFERENCES "public"."login_identity"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "push_queue_unsent_idx" ON "push_queue" USING btree ("sent_at");