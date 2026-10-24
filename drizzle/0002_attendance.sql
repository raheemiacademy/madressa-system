CREATE TYPE "public"."attendance_code_type" AS ENUM('present', 'approved', 'authorised', 'unauthorised', 'not_counted');--> statement-breakpoint
CREATE TYPE "public"."holiday_request_status" AS ENUM('Pending', 'Accepted', 'Declined', 'Info requested');--> statement-breakpoint
CREATE TYPE "public"."attendance_mark_kind" AS ENUM('present', 'late', 'absent', 'left_early', 'not_counted');--> statement-breakpoint
CREATE TABLE "absence_notice" (
	"id" serial PRIMARY KEY NOT NULL,
	"student_id" integer NOT NULL,
	"contact_id" integer,
	"date" date NOT NULL,
	"kind" text NOT NULL,
	"expected_arrival" time,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"seen_at" timestamp with time zone,
	"seen_by" integer,
	CONSTRAINT "absence_notice_kind" CHECK ("absence_notice"."kind" in ('absent', 'late'))
);
--> statement-breakpoint
CREATE TABLE "attendance_code" (
	"code" text PRIMARY KEY NOT NULL,
	"description" text NOT NULL,
	"type" "attendance_code_type" NOT NULL,
	"keys" text,
	"is_late" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attendance_mark" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"student_id" integer NOT NULL,
	"mark" "attendance_mark_kind" NOT NULL,
	"code" text,
	"authorised" boolean,
	"notified" boolean DEFAULT false NOT NULL,
	"late_minutes" integer,
	"left_early_minutes" integer,
	"note" text,
	"updated_by" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendance_mark_minutes" CHECK (coalesce("attendance_mark"."late_minutes", 0) between 0 and 600 and coalesce("attendance_mark"."left_early_minutes", 0) between 0 and 600)
);
--> statement-breakpoint
CREATE TABLE "fire_drill" (
	"id" serial PRIMARY KEY NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_by" integer,
	"started_by_name" text NOT NULL,
	"ended_at" timestamp with time zone,
	"safe_class_ids" integer[] DEFAULT '{}'::int[] NOT NULL,
	"report" jsonb
);
--> statement-breakpoint
CREATE TABLE "holiday_request" (
	"id" serial PRIMARY KEY NOT NULL,
	"contact_id" integer,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"request" text NOT NULL,
	"response" text,
	"status" "holiday_request_status" DEFAULT 'Pending' NOT NULL,
	"accepted_as" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"responded_at" timestamp with time zone,
	"responded_by" integer,
	CONSTRAINT "holiday_request_dates" CHECK ("holiday_request"."ends_on" >= "holiday_request"."starts_on")
);
--> statement-breakpoint
CREATE TABLE "holiday_request_student" (
	"request_id" integer NOT NULL,
	"student_id" integer NOT NULL,
	CONSTRAINT "holiday_request_student_request_id_student_id_pk" PRIMARY KEY("request_id","student_id")
);
--> statement-breakpoint
CREATE TABLE "kiosk_device" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "kiosk_device_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "register_session" (
	"id" serial PRIMARY KEY NOT NULL,
	"class_id" integer NOT NULL,
	"date" date NOT NULL,
	"start_time" time NOT NULL,
	"slot_id" integer,
	"taken_by" integer,
	"taken_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teacher_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"teacher_id" integer NOT NULL,
	"date" date NOT NULL,
	"time_in" time,
	"time_out" time,
	"absent" boolean DEFAULT false NOT NULL,
	"source" text NOT NULL,
	"note" text,
	"logged_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" integer,
	CONSTRAINT "teacher_log_times" CHECK ("teacher_log"."time_out" is null or "teacher_log"."time_in" is null or "teacher_log"."time_out" >= "teacher_log"."time_in")
);
--> statement-breakpoint
ALTER TABLE "absence_notice" ADD CONSTRAINT "absence_notice_student_id_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."student"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "absence_notice" ADD CONSTRAINT "absence_notice_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "absence_notice" ADD CONSTRAINT "absence_notice_seen_by_login_identity_id_fk" FOREIGN KEY ("seen_by") REFERENCES "public"."login_identity"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_mark" ADD CONSTRAINT "attendance_mark_session_id_register_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."register_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_mark" ADD CONSTRAINT "attendance_mark_student_id_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."student"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_mark" ADD CONSTRAINT "attendance_mark_code_attendance_code_code_fk" FOREIGN KEY ("code") REFERENCES "public"."attendance_code"("code") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_mark" ADD CONSTRAINT "attendance_mark_updated_by_login_identity_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."login_identity"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fire_drill" ADD CONSTRAINT "fire_drill_started_by_login_identity_id_fk" FOREIGN KEY ("started_by") REFERENCES "public"."login_identity"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holiday_request" ADD CONSTRAINT "holiday_request_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holiday_request" ADD CONSTRAINT "holiday_request_responded_by_login_identity_id_fk" FOREIGN KEY ("responded_by") REFERENCES "public"."login_identity"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holiday_request_student" ADD CONSTRAINT "holiday_request_student_request_id_holiday_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."holiday_request"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holiday_request_student" ADD CONSTRAINT "holiday_request_student_student_id_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."student"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kiosk_device" ADD CONSTRAINT "kiosk_device_created_by_login_identity_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."login_identity"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "register_session" ADD CONSTRAINT "register_session_class_id_school_class_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."school_class"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "register_session" ADD CONSTRAINT "register_session_slot_id_timetable_slot_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."timetable_slot"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "register_session" ADD CONSTRAINT "register_session_taken_by_login_identity_id_fk" FOREIGN KEY ("taken_by") REFERENCES "public"."login_identity"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_log" ADD CONSTRAINT "teacher_log_teacher_id_teacher_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teacher"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_log" ADD CONSTRAINT "teacher_log_updated_by_login_identity_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."login_identity"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "absence_notice_date_idx" ON "absence_notice" USING btree ("date");--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_mark_uq" ON "attendance_mark" USING btree ("session_id","student_id");--> statement-breakpoint
CREATE INDEX "attendance_mark_student_idx" ON "attendance_mark" USING btree ("student_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fire_drill_one_running" ON "fire_drill" USING btree ((true)) WHERE "fire_drill"."ended_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "register_session_uq" ON "register_session" USING btree ("class_id","date","start_time");--> statement-breakpoint
CREATE INDEX "register_session_date_idx" ON "register_session" USING btree ("date");--> statement-breakpoint
CREATE UNIQUE INDEX "teacher_log_uq" ON "teacher_log" USING btree ("teacher_id","date");--> statement-breakpoint
INSERT INTO "attendance_code" ("code", "description", "type", "keys", "is_late", "sort_order") VALUES
('/', 'Present', 'present', '/', false, 1),
('L', 'Late, arrived before registers closed', 'present', 'L', true, 2),
('B', 'Off-site educational activity', 'approved', 'B', false, 3),
('J', 'Interview', 'approved', 'J', false, 4),
('P', 'Approved sporting activity', 'approved', 'P', false, 5),
('V', 'Educational visit or trip', 'approved', 'V', false, 6),
('W', 'Work experience', 'approved', 'W', false, 7),
('C', 'Leave of absence authorised for exceptional circumstances', 'authorised', 'C', false, 8),
('E', 'Excluded, no alternative provision', 'authorised', 'E', false, 9),
('I', 'Illness', 'authorised', 'I', false, 10),
('M', 'Medical or dental appointment', 'authorised', 'M', false, 11),
('R', 'Religious observance', 'authorised', 'R', false, 12),
('S', 'Study leave', 'authorised', 'S', false, 13),
('T', 'Traveller absence', 'authorised', 'T', false, 14),
('G', 'Holiday not authorised', 'unauthorised', 'G', false, 15),
('N', 'Reason not yet provided', 'unauthorised', 'N', false, 16),
('O', 'Absent in other unauthorised circumstances', 'unauthorised', 'O', false, 17),
('U', 'Arrived after registers closed', 'unauthorised', 'U', true, 18),
('X', 'Not required to attend', 'not_counted', 'X', false, 19),
('Y', 'Unable to attend due to exceptional circumstances', 'not_counted', 'Y', false, 20),
('Z', 'Pupil not on roll', 'not_counted', 'Z', false, 21),
('#', 'Planned school closure', 'not_counted', '#', false, 22)
ON CONFLICT DO NOTHING;
