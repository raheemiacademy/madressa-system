CREATE TABLE "achievement" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"sanction" boolean DEFAULT false NOT NULL,
	"merit_id" integer,
	"target" integer NOT NULL,
	"badge" text DEFAULT 'none' NOT NULL,
	"certificate_template_id" integer,
	"for_students" boolean DEFAULT true NOT NULL,
	"for_teachers" boolean DEFAULT false NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	CONSTRAINT "achievement_target" CHECK ("achievement"."target" > 0)
);
--> statement-breakpoint
CREATE TABLE "certificate" (
	"id" serial PRIMARY KEY NOT NULL,
	"template_id" integer,
	"student_id" integer NOT NULL,
	"achievement_id" integer,
	"badge" text DEFAULT 'none' NOT NULL,
	"for_text" text NOT NULL,
	"issued_on" date NOT NULL,
	"on_portal" boolean DEFAULT true NOT NULL,
	"issued_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "certificate_template" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"file_id" uuid,
	"size" text DEFAULT 'A4' NOT NULL,
	"orientation" text DEFAULT 'landscape' NOT NULL,
	"layout" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eoty_entry" (
	"report_id" integer NOT NULL,
	"student_id" integer NOT NULL,
	"scores" smallint[] DEFAULT '{}'::smallint[] NOT NULL,
	"comment" text,
	"written_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "eoty_entry_report_id_student_id_pk" PRIMARY KEY("report_id","student_id")
);
--> statement-breakpoint
CREATE TABLE "eoty_paragraph" (
	"area" text NOT NULL,
	"level" smallint NOT NULL,
	"body" text NOT NULL,
	CONSTRAINT "eoty_paragraph_area_level_pk" PRIMARY KEY("area","level"),
	CONSTRAINT "eoty_paragraph_level" CHECK ("eoty_paragraph"."level" between 1 and 5)
);
--> statement-breakpoint
CREATE TABLE "eoty_report" (
	"id" serial PRIMARY KEY NOT NULL,
	"academic_year_id" integer NOT NULL,
	"title" text NOT NULL,
	"term_start" date NOT NULL,
	"term_end" date NOT NULL,
	"semester_id" integer,
	"include_exams" boolean DEFAULT true NOT NULL,
	"include_positions" boolean DEFAULT false NOT NULL,
	"include_attendance" boolean DEFAULT true NOT NULL,
	"include_homework" boolean DEFAULT true NOT NULL,
	"scoring" boolean DEFAULT true NOT NULL,
	"score_labels" text[] DEFAULT '{Needs support,Developing,Good,Very good,Excellent}'::text[] NOT NULL,
	"questions" text[] DEFAULT '{Behaviour,Progress,Effort}'::text[] NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"teachers_can_download" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "eoty_dates" CHECK ("eoty_report"."term_end" >= "eoty_report"."term_start")
);
--> statement-breakpoint
CREATE TABLE "event" (
	"id" serial PRIMARY KEY NOT NULL,
	"academic_year_id" integer NOT NULL,
	"name" text NOT NULL,
	"date" date NOT NULL,
	"time" time,
	"duration_minutes" integer DEFAULT 0 NOT NULL,
	"opt_in_deadline" date,
	"payment_deadline" date,
	"description" text,
	"terms" text,
	"class_ids" integer[] DEFAULT '{}'::int[] NOT NULL,
	"auto_invoice" boolean DEFAULT true NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_duration" CHECK ("event"."duration_minutes" >= 0)
);
--> statement-breakpoint
CREATE TABLE "event_consent" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" integer NOT NULL,
	"text" text NOT NULL,
	"required" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_opt_in" (
	"event_id" integer NOT NULL,
	"student_id" integer NOT NULL,
	"contact_id" integer,
	"timeslot_id" integer,
	"consent_ids" integer[] DEFAULT '{}'::int[] NOT NULL,
	"price_ids" integer[] DEFAULT '{}'::int[] NOT NULL,
	"total_pence" integer DEFAULT 0 NOT NULL,
	"invoice_id" integer,
	"source" text DEFAULT 'admin' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_opt_in_event_id_student_id_pk" PRIMARY KEY("event_id","student_id")
);
--> statement-breakpoint
CREATE TABLE "event_price" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" integer NOT NULL,
	"description" text NOT NULL,
	"price_pence" integer NOT NULL,
	"required" boolean DEFAULT true NOT NULL,
	CONSTRAINT "event_price_amount" CHECK ("event_price"."price_pence" >= 0)
);
--> statement-breakpoint
CREATE TABLE "event_timeslot" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" integer NOT NULL,
	"date" date NOT NULL,
	"from_time" time NOT NULL,
	"to_time" time NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exam" (
	"id" serial PRIMARY KEY NOT NULL,
	"academic_year_id" integer NOT NULL,
	"class_id" integer NOT NULL,
	"official" boolean DEFAULT true NOT NULL,
	"title" text NOT NULL,
	"date" date NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"grade_system_id" integer,
	"added_by_teacher" boolean DEFAULT false NOT NULL,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exam_status" CHECK ("exam"."status" in ('open', 'closed', 'locked'))
);
--> statement-breakpoint
CREATE TABLE "exam_result" (
	"test_id" integer NOT NULL,
	"student_id" integer NOT NULL,
	"mark_tenths" integer,
	"absent" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exam_result_test_id_student_id_pk" PRIMARY KEY("test_id","student_id"),
	CONSTRAINT "exam_result_mark" CHECK ("exam_result"."mark_tenths" is null or "exam_result"."mark_tenths" >= 0)
);
--> statement-breakpoint
CREATE TABLE "exam_test" (
	"id" serial PRIMARY KEY NOT NULL,
	"exam_id" integer NOT NULL,
	"subject_id" integer,
	"name" text NOT NULL,
	"max_marks" smallint NOT NULL,
	"sort_order" smallint DEFAULT 0 NOT NULL,
	CONSTRAINT "exam_test_max" CHECK ("exam_test"."max_marks" between 1 and 1000)
);
--> statement-breakpoint
CREATE TABLE "forum_category" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"class_ids" integer[] DEFAULT '{}'::int[] NOT NULL
);
--> statement-breakpoint
CREATE TABLE "forum_post" (
	"id" serial PRIMARY KEY NOT NULL,
	"topic_id" integer NOT NULL,
	"author_kind" "party_kind" NOT NULL,
	"author_id" integer NOT NULL,
	"author_name" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" text
);
--> statement-breakpoint
CREATE TABLE "forum_topic" (
	"id" serial PRIMARY KEY NOT NULL,
	"category_id" integer NOT NULL,
	"title" text NOT NULL,
	"author_kind" "party_kind" NOT NULL,
	"author_id" integer NOT NULL,
	"author_name" text NOT NULL,
	"locked" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_post_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "grade_band" (
	"system_id" integer NOT NULL,
	"min_pct" smallint NOT NULL,
	"grade" text NOT NULL,
	CONSTRAINT "grade_band_system_id_min_pct_pk" PRIMARY KEY("system_id","min_pct"),
	CONSTRAINT "grade_band_pct" CHECK ("grade_band"."min_pct" between 0 and 100)
);
--> statement-breakpoint
CREATE TABLE "grade_system" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	CONSTRAINT "grade_system_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "homework" (
	"id" serial PRIMARY KEY NOT NULL,
	"academic_year_id" integer NOT NULL,
	"class_id" integer NOT NULL,
	"teacher_id" integer,
	"title" text NOT NULL,
	"instructions" text DEFAULT '' NOT NULL,
	"deadline_at" timestamp with time zone NOT NULL,
	"lock_after_deadline" boolean DEFAULT false NOT NULL,
	"allow_uploads" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"locked" boolean DEFAULT false NOT NULL,
	"file_id" uuid,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "homework_student" (
	"homework_id" integer NOT NULL,
	"student_id" integer NOT NULL,
	"completed_at" timestamp with time zone,
	"note" text,
	"upload_file_id" uuid,
	CONSTRAINT "homework_student_homework_id_student_id_pk" PRIMARY KEY("homework_id","student_id")
);
--> statement-breakpoint
CREATE TABLE "homework_template" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"instructions" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "incident" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"student_id" integer,
	"class_id" integer,
	"teacher_id" integer,
	"staff_id" integer,
	"severity" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"title" text NOT NULL,
	"report" text NOT NULL,
	"action" text,
	"in_eoty" boolean DEFAULT false NOT NULL,
	"on_portal" boolean DEFAULT false NOT NULL,
	"emailed" boolean DEFAULT false NOT NULL,
	"texted" boolean DEFAULT false NOT NULL,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "incident_kind" CHECK (("incident"."kind" = 'student' and "incident"."student_id" is not null) or ("incident"."kind" = 'teacher' and "incident"."teacher_id" is not null) or ("incident"."kind" = 'staff' and "incident"."staff_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "incident_template" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"severity" text DEFAULT 'Low' NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"report" text DEFAULT '' NOT NULL,
	"action" text DEFAULT '' NOT NULL,
	"in_eoty" boolean DEFAULT false NOT NULL,
	"on_portal" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merit" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"points" smallint DEFAULT 1 NOT NULL,
	"for_students" boolean DEFAULT true NOT NULL,
	"for_teachers" boolean DEFAULT false NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"official" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merit_award" (
	"id" serial PRIMARY KEY NOT NULL,
	"merit_id" integer NOT NULL,
	"student_id" integer,
	"teacher_id" integer,
	"class_id" integer,
	"points" smallint NOT NULL,
	"comment" text,
	"awarded_on" date NOT NULL,
	"awarded_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "merit_award_who" CHECK (("merit_award"."student_id" is null) <> ("merit_award"."teacher_id" is null))
);
--> statement-breakpoint
CREATE TABLE "merit_team" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"colour" text DEFAULT 'lav' NOT NULL,
	"class_ids" integer[] DEFAULT '{}'::int[] NOT NULL,
	"student_ids" integer[] DEFAULT '{}'::int[] NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"image_file_id" uuid,
	"price_pence" integer DEFAULT 0 NOT NULL,
	"original_price_pence" integer,
	"merit_price" integer,
	"stock" integer,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "product_prices" CHECK ("product"."price_pence" >= 0 and ("product"."merit_price" is null or "product"."merit_price" > 0) and ("product"."stock" is null or "product"."stock" >= 0))
);
--> statement-breakpoint
CREATE TABLE "product_sale" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"student_id" integer,
	"contact_id" integer,
	"class_id" integer,
	"qty" integer NOT NULL,
	"total_pence" integer DEFAULT 0 NOT NULL,
	"merits_spent" integer DEFAULT 0 NOT NULL,
	"invoice_id" integer,
	"sold_on" date NOT NULL,
	"delivered_at" timestamp with time zone,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_sale_qty" CHECK ("product_sale"."qty" > 0 and "product_sale"."total_pence" >= 0 and "product_sale"."merits_spent" >= 0)
);
--> statement-breakpoint
CREATE TABLE "quiz" (
	"id" serial PRIMARY KEY NOT NULL,
	"subject_id" integer,
	"title" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"teacher_id" integer,
	"class_ids" integer[] DEFAULT '{}'::int[] NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	CONSTRAINT "quiz_times" CHECK ("quiz"."ends_at" > "quiz"."starts_at"),
	CONSTRAINT "quiz_status" CHECK ("quiz"."status" in ('draft', 'open', 'closed'))
);
--> statement-breakpoint
CREATE TABLE "semester" (
	"id" serial PRIMARY KEY NOT NULL,
	"academic_year_id" integer NOT NULL,
	"title" text NOT NULL,
	"class_ids" integer[] DEFAULT '{}'::int[] NOT NULL,
	"exam_ids" integer[] DEFAULT '{}'::int[] NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_competition" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	CONSTRAINT "team_competition_dates" CHECK ("team_competition"."ends_on" >= "team_competition"."starts_on")
);
--> statement-breakpoint
ALTER TABLE "achievement" ADD CONSTRAINT "achievement_merit_id_merit_id_fk" FOREIGN KEY ("merit_id") REFERENCES "public"."merit"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "achievement" ADD CONSTRAINT "achievement_certificate_template_id_certificate_template_id_fk" FOREIGN KEY ("certificate_template_id") REFERENCES "public"."certificate_template"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificate" ADD CONSTRAINT "certificate_template_id_certificate_template_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."certificate_template"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificate" ADD CONSTRAINT "certificate_student_id_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."student"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificate" ADD CONSTRAINT "certificate_achievement_id_achievement_id_fk" FOREIGN KEY ("achievement_id") REFERENCES "public"."achievement"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificate_template" ADD CONSTRAINT "certificate_template_file_id_file_object_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."file_object"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eoty_entry" ADD CONSTRAINT "eoty_entry_report_id_eoty_report_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."eoty_report"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eoty_entry" ADD CONSTRAINT "eoty_entry_student_id_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."student"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eoty_report" ADD CONSTRAINT "eoty_report_academic_year_id_academic_year_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_year"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eoty_report" ADD CONSTRAINT "eoty_report_semester_id_semester_id_fk" FOREIGN KEY ("semester_id") REFERENCES "public"."semester"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_academic_year_id_academic_year_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_year"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_consent" ADD CONSTRAINT "event_consent_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_opt_in" ADD CONSTRAINT "event_opt_in_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_opt_in" ADD CONSTRAINT "event_opt_in_student_id_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."student"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_opt_in" ADD CONSTRAINT "event_opt_in_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_opt_in" ADD CONSTRAINT "event_opt_in_timeslot_id_event_timeslot_id_fk" FOREIGN KEY ("timeslot_id") REFERENCES "public"."event_timeslot"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_opt_in" ADD CONSTRAINT "event_opt_in_invoice_id_invoice_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoice"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_price" ADD CONSTRAINT "event_price_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_timeslot" ADD CONSTRAINT "event_timeslot_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam" ADD CONSTRAINT "exam_academic_year_id_academic_year_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_year"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam" ADD CONSTRAINT "exam_class_id_school_class_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."school_class"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam" ADD CONSTRAINT "exam_grade_system_id_grade_system_id_fk" FOREIGN KEY ("grade_system_id") REFERENCES "public"."grade_system"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam" ADD CONSTRAINT "exam_created_by_login_identity_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."login_identity"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_result" ADD CONSTRAINT "exam_result_test_id_exam_test_id_fk" FOREIGN KEY ("test_id") REFERENCES "public"."exam_test"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_result" ADD CONSTRAINT "exam_result_student_id_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."student"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_test" ADD CONSTRAINT "exam_test_exam_id_exam_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exam"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_test" ADD CONSTRAINT "exam_test_subject_id_subject_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subject"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forum_post" ADD CONSTRAINT "forum_post_topic_id_forum_topic_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."forum_topic"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forum_topic" ADD CONSTRAINT "forum_topic_category_id_forum_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."forum_category"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grade_band" ADD CONSTRAINT "grade_band_system_id_grade_system_id_fk" FOREIGN KEY ("system_id") REFERENCES "public"."grade_system"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "homework" ADD CONSTRAINT "homework_academic_year_id_academic_year_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_year"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "homework" ADD CONSTRAINT "homework_class_id_school_class_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."school_class"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "homework" ADD CONSTRAINT "homework_teacher_id_teacher_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teacher"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "homework" ADD CONSTRAINT "homework_file_id_file_object_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."file_object"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "homework" ADD CONSTRAINT "homework_created_by_login_identity_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."login_identity"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "homework_student" ADD CONSTRAINT "homework_student_homework_id_homework_id_fk" FOREIGN KEY ("homework_id") REFERENCES "public"."homework"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "homework_student" ADD CONSTRAINT "homework_student_student_id_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."student"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "homework_student" ADD CONSTRAINT "homework_student_upload_file_id_file_object_id_fk" FOREIGN KEY ("upload_file_id") REFERENCES "public"."file_object"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident" ADD CONSTRAINT "incident_student_id_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."student"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident" ADD CONSTRAINT "incident_class_id_school_class_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."school_class"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident" ADD CONSTRAINT "incident_teacher_id_teacher_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teacher"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident" ADD CONSTRAINT "incident_staff_id_admin_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."admin_staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident" ADD CONSTRAINT "incident_created_by_login_identity_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."login_identity"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merit_award" ADD CONSTRAINT "merit_award_merit_id_merit_id_fk" FOREIGN KEY ("merit_id") REFERENCES "public"."merit"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merit_award" ADD CONSTRAINT "merit_award_student_id_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."student"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merit_award" ADD CONSTRAINT "merit_award_teacher_id_teacher_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teacher"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merit_award" ADD CONSTRAINT "merit_award_class_id_school_class_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."school_class"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product" ADD CONSTRAINT "product_image_file_id_file_object_id_fk" FOREIGN KEY ("image_file_id") REFERENCES "public"."file_object"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_sale" ADD CONSTRAINT "product_sale_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_sale" ADD CONSTRAINT "product_sale_student_id_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."student"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_sale" ADD CONSTRAINT "product_sale_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_sale" ADD CONSTRAINT "product_sale_class_id_school_class_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."school_class"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_sale" ADD CONSTRAINT "product_sale_invoice_id_invoice_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoice"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_sale" ADD CONSTRAINT "product_sale_created_by_login_identity_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."login_identity"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz" ADD CONSTRAINT "quiz_subject_id_subject_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subject"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz" ADD CONSTRAINT "quiz_teacher_id_teacher_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teacher"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "semester" ADD CONSTRAINT "semester_academic_year_id_academic_year_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_year"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "forum_post_topic_idx" ON "forum_post" USING btree ("topic_id");--> statement-breakpoint
CREATE INDEX "homework_class_idx" ON "homework" USING btree ("class_id");--> statement-breakpoint
CREATE INDEX "homework_deadline_idx" ON "homework" USING btree ("deadline_at");--> statement-breakpoint
CREATE INDEX "homework_student_student_idx" ON "homework_student" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "incident_occurred_idx" ON "incident" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "merit_award_student_idx" ON "merit_award" USING btree ("student_id");