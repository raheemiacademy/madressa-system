CREATE TYPE "public"."interval_unit" AS ENUM('days', 'weeks', 'months');--> statement-breakpoint
CREATE TYPE "public"."invoice_type" AS ENUM('Fees', 'Admission Fees', 'Contribution', 'Donation', 'Products');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('Cash', 'Card', 'Cheque', 'Bank Transfer', 'Direct Debit', 'Online', 'Other');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('Pending', 'Cleared', 'Bounced', 'Failed', 'Reversed', 'Processing');--> statement-breakpoint
CREATE TYPE "public"."receipt_state" AS ENUM('unsent', 'sent', 'manual', 'no_email');--> statement-breakpoint
CREATE TABLE "contribution" (
	"id" serial PRIMARY KEY NOT NULL,
	"academic_year_id" integer NOT NULL,
	"description" text NOT NULL,
	"amount_pence" integer NOT NULL,
	"invoice_date" date NOT NULL,
	"due_date" date NOT NULL,
	"audience" text NOT NULL,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contribution_amount" CHECK ("contribution"."amount_pence" > 0)
);
--> statement-breakpoint
CREATE TABLE "direct_debit_mandate" (
	"id" serial PRIMARY KEY NOT NULL,
	"contact_id" integer,
	"provider" text NOT NULL,
	"mandate_id" text NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fee_adjustment" (
	"student_id" integer PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"amount" integer DEFAULT 0 NOT NULL,
	"unit" text DEFAULT 'pence' NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fee_adjustment_kind" CHECK ("fee_adjustment"."kind" in ('deduct', 'add', 'free') and "fee_adjustment"."unit" in ('pence', 'percent') and "fee_adjustment"."amount" >= 0),
	CONSTRAINT "fee_adjustment_pct" CHECK ("fee_adjustment"."unit" <> 'percent' or "fee_adjustment"."amount" <= 10000)
);
--> statement-breakpoint
CREATE TABLE "fee_period" (
	"id" serial PRIMARY KEY NOT NULL,
	"structure_id" integer NOT NULL,
	"name" text NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"invoice_count" smallint DEFAULT 1 NOT NULL,
	"interval_count" smallint DEFAULT 1 NOT NULL,
	"interval_unit" interval_unit DEFAULT 'months' NOT NULL,
	"amount_pence" integer NOT NULL,
	"start_weekday" smallint,
	"due_rule" text DEFAULT 'start' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "fee_period_dates" CHECK ("fee_period"."ends_on" >= "fee_period"."starts_on"),
	CONSTRAINT "fee_period_counts" CHECK ("fee_period"."invoice_count" between 1 and 60 and "fee_period"."interval_count" between 1 and 366),
	CONSTRAINT "fee_period_amount" CHECK ("fee_period"."amount_pence" >= 0),
	CONSTRAINT "fee_period_weekday" CHECK ("fee_period"."start_weekday" is null or "fee_period"."start_weekday" between 0 and 6),
	CONSTRAINT "fee_period_due" CHECK ("fee_period"."due_rule" in ('start', 'end', '2', '3', '5', '7', '14', '21'))
);
--> statement-breakpoint
CREATE TABLE "fee_structure" (
	"id" serial PRIMARY KEY NOT NULL,
	"academic_year_id" integer NOT NULL,
	"name" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_ad_hoc" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fee_structure_kind" CHECK (not ("fee_structure"."is_default" and "fee_structure"."is_ad_hoc"))
);
--> statement-breakpoint
CREATE TABLE "fee_structure_class" (
	"class_id" integer PRIMARY KEY NOT NULL,
	"structure_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gateway_event" (
	"provider" text NOT NULL,
	"event_id" text NOT NULL,
	"type" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gateway_event_provider_event_id_pk" PRIMARY KEY("provider","event_id")
);
--> statement-breakpoint
CREATE TABLE "invoice" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" "invoice_type" DEFAULT 'Fees' NOT NULL,
	"student_id" integer NOT NULL,
	"academic_year_id" integer NOT NULL,
	"billing_contact_id" integer,
	"billing_name" text,
	"billing_address" text,
	"billing_postcode" text,
	"billing_notes" text,
	"invoice_date" date NOT NULL,
	"period_from" date,
	"period_to" date,
	"due_date" date NOT NULL,
	"amount_pence" integer NOT NULL,
	"description" text,
	"generation_key" text,
	"period_id" integer,
	"contribution_id" integer,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "invoice_generation_key_unique" UNIQUE("generation_key"),
	CONSTRAINT "invoice_amount" CHECK ("invoice"."amount_pence" >= 0),
	CONSTRAINT "invoice_period" CHECK ("invoice"."period_to" is null or "invoice"."period_from" is null or "invoice"."period_to" >= "invoice"."period_from")
);
--> statement-breakpoint
CREATE TABLE "payment" (
	"id" serial PRIMARY KEY NOT NULL,
	"invoice_id" integer NOT NULL,
	"amount_pence" integer NOT NULL,
	"received_on" date NOT NULL,
	"method" "payment_method" NOT NULL,
	"status" "payment_status" DEFAULT 'Cleared' NOT NULL,
	"reference" text,
	"note" text,
	"receipt_state" "receipt_state" DEFAULT 'unsent' NOT NULL,
	"receipt_sent_at" timestamp with time zone,
	"gateway_provider" text,
	"gateway_payment_id" text,
	"checkout_group" uuid,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_amount" CHECK ("payment"."amount_pence" > 0)
);
--> statement-breakpoint
CREATE TABLE "sibling_discount_rule" (
	"set_id" integer NOT NULL,
	"position" smallint NOT NULL,
	"kind" text NOT NULL,
	"amount" integer NOT NULL,
	"unit" text NOT NULL,
	CONSTRAINT "sibling_discount_rule_set_id_position_pk" PRIMARY KEY("set_id","position"),
	CONSTRAINT "sibling_rule_values" CHECK ("sibling_discount_rule"."position" between 2 and 20 and "sibling_discount_rule"."kind" in ('deduct', 'add') and "sibling_discount_rule"."unit" in ('pence', 'percent') and "sibling_discount_rule"."amount" >= 0 and ("sibling_discount_rule"."unit" <> 'percent' or "sibling_discount_rule"."amount" <= 10000))
);
--> statement-breakpoint
CREATE TABLE "sibling_discount_set" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contribution" ADD CONSTRAINT "contribution_academic_year_id_academic_year_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_year"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contribution" ADD CONSTRAINT "contribution_created_by_login_identity_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."login_identity"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "direct_debit_mandate" ADD CONSTRAINT "direct_debit_mandate_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_adjustment" ADD CONSTRAINT "fee_adjustment_student_id_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."student"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_period" ADD CONSTRAINT "fee_period_structure_id_fee_structure_id_fk" FOREIGN KEY ("structure_id") REFERENCES "public"."fee_structure"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_structure" ADD CONSTRAINT "fee_structure_academic_year_id_academic_year_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_year"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_structure_class" ADD CONSTRAINT "fee_structure_class_class_id_school_class_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."school_class"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_structure_class" ADD CONSTRAINT "fee_structure_class_structure_id_fee_structure_id_fk" FOREIGN KEY ("structure_id") REFERENCES "public"."fee_structure"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_student_id_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."student"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_academic_year_id_academic_year_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_year"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_billing_contact_id_contact_id_fk" FOREIGN KEY ("billing_contact_id") REFERENCES "public"."contact"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_period_id_fee_period_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."fee_period"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_contribution_id_contribution_id_fk" FOREIGN KEY ("contribution_id") REFERENCES "public"."contribution"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_created_by_login_identity_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."login_identity"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_invoice_id_invoice_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoice"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_created_by_login_identity_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."login_identity"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sibling_discount_rule" ADD CONSTRAINT "sibling_discount_rule_set_id_sibling_discount_set_id_fk" FOREIGN KEY ("set_id") REFERENCES "public"."sibling_discount_set"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "direct_debit_mandate_uq" ON "direct_debit_mandate" USING btree ("provider","mandate_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fee_structure_one_default" ON "fee_structure" USING btree ("academic_year_id") WHERE "fee_structure"."is_default";--> statement-breakpoint
CREATE INDEX "invoice_student_idx" ON "invoice" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "invoice_due_idx" ON "invoice" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "invoice_year_idx" ON "invoice" USING btree ("academic_year_id");--> statement-breakpoint
CREATE INDEX "payment_invoice_idx" ON "payment" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "payment_received_idx" ON "payment" USING btree ("received_on");--> statement-breakpoint
CREATE INDEX "payment_gateway_idx" ON "payment" USING btree ("gateway_provider","gateway_payment_id");