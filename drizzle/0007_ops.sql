CREATE TABLE "api_key" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"prefix" text NOT NULL,
	"key_hash" text NOT NULL,
	"scopes" text[] NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "api_key_key_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
CREATE TABLE "app_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"kind" text NOT NULL,
	"message" text NOT NULL,
	"identity_id" integer,
	"details" jsonb,
	CONSTRAINT "app_log_kind" CHECK ("app_log"."kind" in ('system', 'parent', 'student', 'teacher', 'staff', 'contact', 'notification'))
);
--> statement-breakpoint
CREATE TABLE "backup" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"kind" text NOT NULL,
	"size" integer NOT NULL,
	"storage_key" text NOT NULL,
	"checksum" text NOT NULL,
	"schema_version" text NOT NULL,
	"row_count" integer NOT NULL,
	CONSTRAINT "backup_storage_key_unique" UNIQUE("storage_key"),
	CONSTRAINT "backup_kind" CHECK ("backup"."kind" in ('manual', 'nightly'))
);
--> statement-breakpoint
CREATE TABLE "calendar_feed" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calendar_feed_one" CHECK ("calendar_feed"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "worker_heartbeat" (
	"process" text PRIMARY KEY NOT NULL,
	"last_beat" timestamp with time zone DEFAULT now() NOT NULL,
	"details" jsonb
);
--> statement-breakpoint
ALTER TABLE "app_log" ADD CONSTRAINT "app_log_identity_id_login_identity_id_fk" FOREIGN KEY ("identity_id") REFERENCES "public"."login_identity"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "app_log_at_idx" ON "app_log" USING btree ("at");