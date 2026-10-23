CREATE TYPE "public"."portal" AS ENUM('admin', 'teacher', 'parent', 'student');--> statement-breakpoint
CREATE TABLE "academic_year" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"is_current" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "academic_year_dates" CHECK ("academic_year"."ends_on" > "academic_year"."starts_on")
);
--> statement-breakpoint
CREATE TABLE "admin_staff" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"mobile" text,
	"rank" text,
	"role" text,
	"dbs_number" text,
	"dbs_issued_on" date,
	"dbs_expires_on" date,
	"is_super" boolean DEFAULT false NOT NULL,
	"can_edit" boolean DEFAULT false NOT NULL,
	"can_delete" boolean DEFAULT false NOT NULL,
	"fees_access" boolean DEFAULT false NOT NULL,
	"marketing" boolean DEFAULT false NOT NULL,
	"send_sms" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_identity_id" integer,
	"actor_name" text NOT NULL,
	"action" text NOT NULL,
	"page" text NOT NULL,
	"entity" text,
	"entity_id" text,
	"details" jsonb
);
--> statement-breakpoint
CREATE TABLE "file_object" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"storage_key" text NOT NULL,
	"filename" text NOT NULL,
	"mime" text NOT NULL,
	"size" integer NOT NULL,
	"purpose" text NOT NULL,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "file_object_storage_key_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
CREATE TABLE "holiday" (
	"id" serial PRIMARY KEY NOT NULL,
	"academic_year_id" integer NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"show_teacher" boolean DEFAULT true NOT NULL,
	"show_parent" boolean DEFAULT true NOT NULL,
	"show_student" boolean DEFAULT true NOT NULL,
	"students_attend" boolean DEFAULT false NOT NULL,
	"teachers_attend" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "holiday_dates" CHECK ("holiday"."ends_on" >= "holiday"."starts_on")
);
--> statement-breakpoint
CREATE TABLE "login_identity" (
	"id" serial PRIMARY KEY NOT NULL,
	"portal" "portal" NOT NULL,
	"email" text NOT NULL,
	"password_hash" text,
	"allow_login" boolean DEFAULT true NOT NULL,
	"failed_attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"admin_staff_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "login_identity_admin_link" CHECK ("login_identity"."portal" <> 'admin' or "login_identity"."admin_staff_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "rate_limit" (
	"key" text PRIMARY KEY NOT NULL,
	"hits" integer NOT NULL,
	"window_started_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "school_profile" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"name" text NOT NULL,
	"logo_file_id" uuid,
	"logo_url" text,
	"address" text,
	"city" text,
	"postcode" text,
	"email" text,
	"no_reply_email" text,
	"bcc_email" text,
	"receipt_sender_email" text,
	"receipt_sender_name" text,
	"tel" text,
	"fax" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "school_profile_singleton" CHECK ("school_profile"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"identity_id" integer NOT NULL,
	"portal" "portal" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip" text,
	"user_agent" text
);
--> statement-breakpoint
CREATE TABLE "setting" (
	"tab" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" integer
);
--> statement-breakpoint
CREATE TABLE "sticky_note" (
	"id" serial PRIMARY KEY NOT NULL,
	"page_path" text NOT NULL,
	"body" text NOT NULL,
	"colour" text NOT NULL,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_identity_id_login_identity_id_fk" FOREIGN KEY ("actor_identity_id") REFERENCES "public"."login_identity"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_object" ADD CONSTRAINT "file_object_created_by_login_identity_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."login_identity"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holiday" ADD CONSTRAINT "holiday_academic_year_id_academic_year_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_year"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "login_identity" ADD CONSTRAINT "login_identity_admin_staff_id_admin_staff_id_fk" FOREIGN KEY ("admin_staff_id") REFERENCES "public"."admin_staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_identity_id_login_identity_id_fk" FOREIGN KEY ("identity_id") REFERENCES "public"."login_identity"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sticky_note" ADD CONSTRAINT "sticky_note_created_by_login_identity_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."login_identity"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "academic_year_title_uq" ON "academic_year" USING btree (lower("title"));--> statement-breakpoint
CREATE UNIQUE INDEX "academic_year_one_current" ON "academic_year" USING btree ("is_current") WHERE "academic_year"."is_current";--> statement-breakpoint
CREATE UNIQUE INDEX "admin_staff_email_uq" ON "admin_staff" USING btree (lower("email")) WHERE "admin_staff"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "audit_log_at_idx" ON "audit_log" USING btree ("at");--> statement-breakpoint
CREATE UNIQUE INDEX "login_identity_portal_email_uq" ON "login_identity" USING btree ("portal",lower("email"));--> statement-breakpoint
CREATE UNIQUE INDEX "login_identity_admin_staff_uq" ON "login_identity" USING btree ("admin_staff_id");--> statement-breakpoint
CREATE INDEX "session_identity_idx" ON "session" USING btree ("identity_id");--> statement-breakpoint
CREATE INDEX "sticky_note_page_idx" ON "sticky_note" USING btree ("page_path");