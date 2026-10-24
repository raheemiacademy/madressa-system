CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE TYPE "public"."contact_type" AS ENUM('Parent', 'Sibling', 'Emergency', 'Other');--> statement-breakpoint
CREATE TYPE "public"."custom_field_entity" AS ENUM('student', 'teacher', 'staff', 'contact');--> statement-breakpoint
CREATE TYPE "public"."custom_field_type" AS ENUM('text', 'multiline', 'number', 'decimal', 'date', 'time', 'radio', 'checkboxes');--> statement-breakpoint
CREATE TYPE "public"."gender" AS ENUM('Male', 'Female', 'Unspecified');--> statement-breakpoint
CREATE TYPE "public"."student_status" AS ENUM('Waiting List', 'Current', 'Relocated/Left', 'Suspended', 'Expelled', 'Finished', 'On Hold', 'Accepted', 'Deceased', 'Rejected');--> statement-breakpoint
CREATE TYPE "public"."teacher_status" AS ENUM('Inactive', 'Employed', 'Suspended', 'Dismissed', 'Resigned', 'Retired', 'Volunteer');--> statement-breakpoint
CREATE TABLE "application_group" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"description" text,
	"required" boolean DEFAULT false NOT NULL,
	"multiple_choice" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "class_assignment" (
	"id" serial PRIMARY KEY NOT NULL,
	"student_id" integer NOT NULL,
	"class_id" integer NOT NULL,
	"from_date" date NOT NULL,
	"to_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "class_assignment_dates" CHECK ("class_assignment"."to_date" is null or "class_assignment"."to_date" >= "class_assignment"."from_date")
);
--> statement-breakpoint
CREATE TABLE "class_teacher" (
	"class_id" integer NOT NULL,
	"teacher_id" integer NOT NULL,
	"can_register" boolean DEFAULT true NOT NULL,
	"can_eoty" boolean DEFAULT false NOT NULL,
	"can_message" boolean DEFAULT false NOT NULL,
	"can_merits" boolean DEFAULT false NOT NULL,
	"can_homework" boolean DEFAULT false NOT NULL,
	"can_incidents" boolean DEFAULT false NOT NULL,
	CONSTRAINT "class_teacher_class_id_teacher_id_pk" PRIMARY KEY("class_id","teacher_id")
);
--> statement-breakpoint
CREATE TABLE "classroom" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"location" text
);
--> statement-breakpoint
CREATE TABLE "contact" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"tel" text,
	"mobile" text,
	"alt_mobile" text,
	"address" text,
	"postcode" text,
	"gender" "gender",
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contact_group" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contact_group_member" (
	"contact_id" integer NOT NULL,
	"group_id" integer NOT NULL,
	CONSTRAINT "contact_group_member_contact_id_group_id_pk" PRIMARY KEY("contact_id","group_id")
);
--> statement-breakpoint
CREATE TABLE "custom_field" (
	"id" serial PRIMARY KEY NOT NULL,
	"entity" "custom_field_entity" NOT NULL,
	"label" text NOT NULL,
	"question" text,
	"type" "custom_field_type" NOT NULL,
	"max_length" integer,
	"decimals" smallint,
	"options" text[] DEFAULT '{}'::text[] NOT NULL,
	"searchable" boolean DEFAULT false NOT NULL,
	"on_registration" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "custom_field_value" (
	"field_id" integer NOT NULL,
	"owner_id" integer NOT NULL,
	"value" jsonb NOT NULL,
	CONSTRAINT "custom_field_value_field_id_owner_id_pk" PRIMARY KEY("field_id","owner_id")
);
--> statement-breakpoint
CREATE TABLE "holiday_class" (
	"holiday_id" integer NOT NULL,
	"class_id" integer NOT NULL,
	CONSTRAINT "holiday_class_holiday_id_class_id_pk" PRIMARY KEY("holiday_id","class_id")
);
--> statement-breakpoint
CREATE TABLE "school_class" (
	"id" serial PRIMARY KEY NOT NULL,
	"academic_year_id" integer NOT NULL,
	"name" text NOT NULL,
	"year_group_id" integer,
	"main_teacher_id" integer,
	"capacity" integer,
	"starts_on" date,
	"ends_on" date,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "school_class_capacity" CHECK ("school_class"."capacity" is null or "school_class"."capacity" >= 0)
);
--> statement-breakpoint
CREATE TABLE "sibling_link" (
	"student_a" integer NOT NULL,
	"student_b" integer NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sibling_link_student_a_student_b_pk" PRIMARY KEY("student_a","student_b"),
	CONSTRAINT "sibling_order" CHECK ("sibling_link"."student_a" < "sibling_link"."student_b")
);
--> statement-breakpoint
CREATE TABLE "student" (
	"id" serial PRIMARY KEY NOT NULL,
	"first_name" text NOT NULL,
	"surname" text NOT NULL,
	"dob" date,
	"gender" "gender" DEFAULT 'Unspecified' NOT NULL,
	"email" text,
	"tel" text,
	"mobile" text,
	"mobile2" text,
	"address" text,
	"postcode" text,
	"status" "student_status" DEFAULT 'Waiting List' NOT NULL,
	"start_date" date,
	"left_date" date,
	"medical_notes_enc" text,
	"has_medical" boolean DEFAULT false NOT NULL,
	"notes" text,
	"photo_file_id" uuid,
	"is_adult" boolean DEFAULT false NOT NULL,
	"source" text DEFAULT 'admin' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "student_application_group" (
	"student_id" integer NOT NULL,
	"group_id" integer NOT NULL,
	CONSTRAINT "student_application_group_student_id_group_id_pk" PRIMARY KEY("student_id","group_id")
);
--> statement-breakpoint
CREATE TABLE "student_contact" (
	"student_id" integer NOT NULL,
	"contact_id" integer NOT NULL,
	"type" "contact_type" DEFAULT 'Parent' NOT NULL,
	"relation" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"portal_access" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "student_contact_student_id_contact_id_pk" PRIMARY KEY("student_id","contact_id")
);
--> statement-breakpoint
CREATE TABLE "student_file" (
	"student_id" integer NOT NULL,
	"file_id" uuid NOT NULL,
	CONSTRAINT "student_file_student_id_file_id_pk" PRIMARY KEY("student_id","file_id")
);
--> statement-breakpoint
CREATE TABLE "student_note" (
	"id" serial PRIMARY KEY NOT NULL,
	"student_id" integer NOT NULL,
	"body" text NOT NULL,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subject" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text
);
--> statement-breakpoint
CREATE TABLE "teacher" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"dob" date,
	"gender" "gender" DEFAULT 'Unspecified' NOT NULL,
	"email" text,
	"tel" text,
	"mobile" text,
	"status" "teacher_status" DEFAULT 'Employed' NOT NULL,
	"start_date" date,
	"left_date" date,
	"photo_file_id" uuid,
	"address" text,
	"postcode" text,
	"ni_number_enc" text,
	"dbs_number" text,
	"dbs_issued_on" date,
	"dbs_expires_on" date,
	"medical_enc" text,
	"bank_name_enc" text,
	"bank_account_enc" text,
	"bank_sort_code_enc" text,
	"kiosk_pin_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "teacher_emergency_contact" (
	"id" serial PRIMARY KEY NOT NULL,
	"teacher_id" integer NOT NULL,
	"name" text NOT NULL,
	"relation" text,
	"phone" text
);
--> statement-breakpoint
CREATE TABLE "teacher_hours" (
	"teacher_id" integer NOT NULL,
	"weekday" smallint NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	CONSTRAINT "teacher_hours_teacher_id_weekday_pk" PRIMARY KEY("teacher_id","weekday"),
	CONSTRAINT "teacher_hours_day" CHECK ("teacher_hours"."weekday" between 1 and 7),
	CONSTRAINT "teacher_hours_order" CHECK ("teacher_hours"."end_time" > "teacher_hours"."start_time")
);
--> statement-breakpoint
CREATE TABLE "timetable_slot" (
	"id" serial PRIMARY KEY NOT NULL,
	"class_id" integer,
	"template_id" integer,
	"weekday" smallint NOT NULL,
	"start_time" time NOT NULL,
	"duration_minutes" integer NOT NULL,
	"teacher_id" integer,
	"classroom_id" integer,
	"subject_id" integer,
	"takes_register" boolean DEFAULT true NOT NULL,
	CONSTRAINT "timetable_slot_owner" CHECK (("timetable_slot"."class_id" is null) <> ("timetable_slot"."template_id" is null)),
	CONSTRAINT "timetable_slot_day" CHECK ("timetable_slot"."weekday" between 1 and 7),
	CONSTRAINT "timetable_slot_duration" CHECK ("timetable_slot"."duration_minutes" between 1 and 1440)
);
--> statement-breakpoint
CREATE TABLE "timetable_template" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "walk_home_consent" (
	"student_id" integer PRIMARY KEY NOT NULL,
	"contact_id" integer,
	"given_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source" text NOT NULL,
	"notes" text,
	"recorded_by" integer
);
--> statement-breakpoint
CREATE TABLE "year_group" (
	"id" serial PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"min_age" smallint NOT NULL,
	"max_age" smallint NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "year_group_ages" CHECK ("year_group"."max_age" >= "year_group"."min_age" and "year_group"."min_age" >= 0)
);
--> statement-breakpoint
ALTER TABLE "login_identity" DROP CONSTRAINT "login_identity_admin_link";--> statement-breakpoint
ALTER TABLE "holiday" ADD COLUMN "all_classes" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "login_identity" ADD COLUMN "teacher_id" integer;--> statement-breakpoint
ALTER TABLE "login_identity" ADD COLUMN "contact_id" integer;--> statement-breakpoint
ALTER TABLE "login_identity" ADD COLUMN "student_id" integer;--> statement-breakpoint
ALTER TABLE "class_assignment" ADD CONSTRAINT "class_assignment_student_id_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."student"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_assignment" ADD CONSTRAINT "class_assignment_class_id_school_class_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."school_class"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_teacher" ADD CONSTRAINT "class_teacher_class_id_school_class_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."school_class"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_teacher" ADD CONSTRAINT "class_teacher_teacher_id_teacher_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teacher"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_group_member" ADD CONSTRAINT "contact_group_member_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_group_member" ADD CONSTRAINT "contact_group_member_group_id_contact_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."contact_group"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_field_value" ADD CONSTRAINT "custom_field_value_field_id_custom_field_id_fk" FOREIGN KEY ("field_id") REFERENCES "public"."custom_field"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holiday_class" ADD CONSTRAINT "holiday_class_holiday_id_holiday_id_fk" FOREIGN KEY ("holiday_id") REFERENCES "public"."holiday"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holiday_class" ADD CONSTRAINT "holiday_class_class_id_school_class_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."school_class"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_class" ADD CONSTRAINT "school_class_academic_year_id_academic_year_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_year"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_class" ADD CONSTRAINT "school_class_year_group_id_year_group_id_fk" FOREIGN KEY ("year_group_id") REFERENCES "public"."year_group"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_class" ADD CONSTRAINT "school_class_main_teacher_id_teacher_id_fk" FOREIGN KEY ("main_teacher_id") REFERENCES "public"."teacher"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sibling_link" ADD CONSTRAINT "sibling_link_student_a_student_id_fk" FOREIGN KEY ("student_a") REFERENCES "public"."student"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sibling_link" ADD CONSTRAINT "sibling_link_student_b_student_id_fk" FOREIGN KEY ("student_b") REFERENCES "public"."student"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student" ADD CONSTRAINT "student_photo_file_id_file_object_id_fk" FOREIGN KEY ("photo_file_id") REFERENCES "public"."file_object"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_application_group" ADD CONSTRAINT "student_application_group_student_id_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."student"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_application_group" ADD CONSTRAINT "student_application_group_group_id_application_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."application_group"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_contact" ADD CONSTRAINT "student_contact_student_id_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."student"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_contact" ADD CONSTRAINT "student_contact_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_file" ADD CONSTRAINT "student_file_student_id_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."student"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_file" ADD CONSTRAINT "student_file_file_id_file_object_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."file_object"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_note" ADD CONSTRAINT "student_note_student_id_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."student"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_note" ADD CONSTRAINT "student_note_created_by_login_identity_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."login_identity"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher" ADD CONSTRAINT "teacher_photo_file_id_file_object_id_fk" FOREIGN KEY ("photo_file_id") REFERENCES "public"."file_object"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_emergency_contact" ADD CONSTRAINT "teacher_emergency_contact_teacher_id_teacher_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teacher"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_hours" ADD CONSTRAINT "teacher_hours_teacher_id_teacher_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teacher"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timetable_slot" ADD CONSTRAINT "timetable_slot_class_id_school_class_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."school_class"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timetable_slot" ADD CONSTRAINT "timetable_slot_template_id_timetable_template_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."timetable_template"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timetable_slot" ADD CONSTRAINT "timetable_slot_teacher_id_teacher_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teacher"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timetable_slot" ADD CONSTRAINT "timetable_slot_classroom_id_classroom_id_fk" FOREIGN KEY ("classroom_id") REFERENCES "public"."classroom"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timetable_slot" ADD CONSTRAINT "timetable_slot_subject_id_subject_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subject"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "walk_home_consent" ADD CONSTRAINT "walk_home_consent_student_id_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."student"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "walk_home_consent" ADD CONSTRAINT "walk_home_consent_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "walk_home_consent" ADD CONSTRAINT "walk_home_consent_recorded_by_login_identity_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."login_identity"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "class_assignment_student_idx" ON "class_assignment" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "class_assignment_class_idx" ON "class_assignment" USING btree ("class_id");--> statement-breakpoint
CREATE UNIQUE INDEX "class_assignment_one_open" ON "class_assignment" USING btree ("student_id","class_id") WHERE "class_assignment"."to_date" is null;--> statement-breakpoint
CREATE INDEX "contact_name_trgm" ON "contact" USING gin (lower("name") gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "contact_group_name_uq" ON "contact_group" USING btree (lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "school_class_year_name_uq" ON "school_class" USING btree ("academic_year_id",lower("name"));--> statement-breakpoint
CREATE INDEX "student_status_idx" ON "student" USING btree ("status");--> statement-breakpoint
CREATE INDEX "student_name_trgm" ON "student" USING gin ((lower("first_name" || ' ' || "surname")) gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "student_contact_contact_idx" ON "student_contact" USING btree ("contact_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subject_name_uq" ON "subject" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX "teacher_name_trgm" ON "teacher" USING gin (lower("name") gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "year_group_label_uq" ON "year_group" USING btree (lower("label"));--> statement-breakpoint
ALTER TABLE "login_identity" ADD CONSTRAINT "login_identity_teacher_id_teacher_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teacher"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "login_identity" ADD CONSTRAINT "login_identity_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "login_identity" ADD CONSTRAINT "login_identity_student_id_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."student"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "login_identity_teacher_uq" ON "login_identity" USING btree ("teacher_id");--> statement-breakpoint
CREATE UNIQUE INDEX "login_identity_contact_uq" ON "login_identity" USING btree ("contact_id");--> statement-breakpoint
CREATE UNIQUE INDEX "login_identity_student_uq" ON "login_identity" USING btree ("student_id");--> statement-breakpoint
ALTER TABLE "login_identity" ADD CONSTRAINT "login_identity_admin_link" CHECK (("login_identity"."portal" = 'admin') = ("login_identity"."admin_staff_id" is not null)
    and ("login_identity"."portal" = 'teacher') = ("login_identity"."teacher_id" is not null)
    and ("login_identity"."portal" = 'parent') = ("login_identity"."contact_id" is not null)
    and ("login_identity"."portal" = 'student') = ("login_identity"."student_id" is not null));