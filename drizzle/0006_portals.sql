CREATE TABLE "details_confirmation" (
	"student_id" integer NOT NULL,
	"academic_year_id" integer NOT NULL,
	"contact_id" integer,
	"confirmed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "details_confirmation_student_id_academic_year_id_pk" PRIMARY KEY("student_id","academic_year_id")
);
--> statement-breakpoint
CREATE TABLE "shared_doc" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"file_id" uuid NOT NULL,
	"audience" text NOT NULL,
	"class_ids" integer[] DEFAULT '{}'::int[] NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shared_doc_audience" CHECK ("shared_doc"."audience" in ('parents', 'teachers', 'both'))
);
--> statement-breakpoint
ALTER TABLE "eoty_report" ADD COLUMN "on_portal" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "homework_student" ADD COLUMN "uploaded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "details_confirmation" ADD CONSTRAINT "details_confirmation_student_id_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."student"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "details_confirmation" ADD CONSTRAINT "details_confirmation_academic_year_id_academic_year_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_year"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "details_confirmation" ADD CONSTRAINT "details_confirmation_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_doc" ADD CONSTRAINT "shared_doc_file_id_file_object_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."file_object"("id") ON DELETE cascade ON UPDATE no action;