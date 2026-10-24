CREATE TYPE "public"."mail_status" AS ENUM('queued', 'sending', 'sent', 'failed');--> statement-breakpoint
CREATE TYPE "public"."party_kind" AS ENUM('admin', 'teacher', 'contact');--> statement-breakpoint
CREATE TYPE "public"."sms_status" AS ENUM('queued', 'sent', 'failed');--> statement-breakpoint
CREATE TABLE "alert_sent" (
	"student_id" integer NOT NULL,
	"kind" text NOT NULL,
	"sent_on" date NOT NULL,
	CONSTRAINT "alert_sent_student_id_kind_sent_on_pk" PRIMARY KEY("student_id","kind","sent_on")
);
--> statement-breakpoint
CREATE TABLE "auth_token" (
	"id" serial PRIMARY KEY NOT NULL,
	"identity_id" integer NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_token_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "job_run" (
	"key" text PRIMARY KEY NOT NULL,
	"last_run_on" date NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mail_queue" (
	"id" serial PRIMARY KEY NOT NULL,
	"to_email" text NOT NULL,
	"to_name" text,
	"from_email" text,
	"from_name" text,
	"reply_to" text,
	"cc" text,
	"bcc" text,
	"subject" text NOT NULL,
	"html" text NOT NULL,
	"attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "mail_status" DEFAULT 'queued' NOT NULL,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"last_error" text,
	"send_after" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"entity" text,
	"entity_id" integer,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message" (
	"id" serial PRIMARY KEY NOT NULL,
	"thread_id" integer NOT NULL,
	"sender_kind" "party_kind" NOT NULL,
	"sender_id" integer NOT NULL,
	"sender_name" text NOT NULL,
	"body" text NOT NULL,
	"attachment_file_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_participant" (
	"thread_id" integer NOT NULL,
	"kind" "party_kind" NOT NULL,
	"person_id" integer NOT NULL,
	"last_read_at" timestamp with time zone,
	"unread_override" boolean DEFAULT false NOT NULL,
	CONSTRAINT "message_participant_thread_id_kind_person_id_pk" PRIMARY KEY("thread_id","kind","person_id")
);
--> statement-breakpoint
CREATE TABLE "message_thread" (
	"id" serial PRIMARY KEY NOT NULL,
	"subject" text NOT NULL,
	"with_office" boolean DEFAULT true NOT NULL,
	"fao_rank" text,
	"locked" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_message_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "newsletter" (
	"id" serial PRIMARY KEY NOT NULL,
	"from_name" text,
	"from_email" text,
	"subject" text NOT NULL,
	"audience" text NOT NULL,
	"class_ids" integer[] DEFAULT '{}'::int[] NOT NULL,
	"style" text DEFAULT 'modern' NOT NULL,
	"signature" text,
	"body" text DEFAULT '' NOT NULL,
	"file_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_sent_at" timestamp with time zone,
	"last_sent_count" integer
);
--> statement-breakpoint
CREATE TABLE "sms_message" (
	"id" serial PRIMARY KEY NOT NULL,
	"to_number" text NOT NULL,
	"recipient_kind" text NOT NULL,
	"recipient_id" integer,
	"recipient_name" text,
	"body" text NOT NULL,
	"status" "sms_status" DEFAULT 'queued' NOT NULL,
	"provider" text,
	"provider_id" text,
	"credits" integer,
	"error" text,
	"batch_id" uuid,
	"sent_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sms_template" (
	"id" serial PRIMARY KEY NOT NULL,
	"category" text NOT NULL,
	"system_key" text,
	"name" text NOT NULL,
	"body" text NOT NULL,
	CONSTRAINT "sms_template_system_key_unique" UNIQUE("system_key")
);
--> statement-breakpoint
CREATE TABLE "template" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"version" text DEFAULT 'Standard' NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" integer
);
--> statement-breakpoint
ALTER TABLE "login_identity" ADD COLUMN "email_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "login_identity" ADD COLUMN "must_change_password" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "alert_sent" ADD CONSTRAINT "alert_sent_student_id_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."student"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_token" ADD CONSTRAINT "auth_token_identity_id_login_identity_id_fk" FOREIGN KEY ("identity_id") REFERENCES "public"."login_identity"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail_queue" ADD CONSTRAINT "mail_queue_created_by_login_identity_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."login_identity"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_thread_id_message_thread_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."message_thread"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_attachment_file_id_file_object_id_fk" FOREIGN KEY ("attachment_file_id") REFERENCES "public"."file_object"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_participant" ADD CONSTRAINT "message_participant_thread_id_message_thread_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."message_thread"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "newsletter" ADD CONSTRAINT "newsletter_created_by_login_identity_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."login_identity"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_message" ADD CONSTRAINT "sms_message_sent_by_login_identity_id_fk" FOREIGN KEY ("sent_by") REFERENCES "public"."login_identity"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template" ADD CONSTRAINT "template_updated_by_login_identity_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."login_identity"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mail_queue_due_idx" ON "mail_queue" USING btree ("status","send_after");--> statement-breakpoint
CREATE INDEX "message_thread_idx" ON "message" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "message_participant_person_idx" ON "message_participant" USING btree ("kind","person_id");--> statement-breakpoint
CREATE INDEX "message_thread_last_idx" ON "message_thread" USING btree ("last_message_at");--> statement-breakpoint
CREATE INDEX "sms_message_created_idx" ON "sms_message" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "sms_message_status_idx" ON "sms_message" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "template_key_version_uq" ON "template" USING btree ("key",lower("version"));--> statement-breakpoint
INSERT INTO "sms_template" ("category", "system_key", "name", "body") VALUES
  ('System', 'two_factor', '2-factor code', '{SCHOOL_NAME}: your sign-in code is {CODE}. It expires in 10 minutes.'),
  ('Attendance', 'absence', 'Absence notify', '{SCHOOL_NAME}: {STUDENT_NAME} was marked absent today ({DATE}). Please contact the office if you did not let us know.'),
  ('Attendance', 'late', 'Late notify', '{SCHOOL_NAME}: {STUDENT_NAME} arrived late today ({DATE}).'),
  ('System', 'fees_reminder', 'Fees reminder', '{SCHOOL_NAME}: a reminder that {AMOUNT} is due for {STUDENT_NAME}. Thank you.'),
  ('System', 'homework', 'Homework', '{SCHOOL_NAME}: new homework has been set for {STUDENT_NAME}.'),
  ('System', 'incident', 'Incident', '{SCHOOL_NAME}: please contact the office about {STUDENT_NAME}.')
ON CONFLICT ("system_key") DO NOTHING;
