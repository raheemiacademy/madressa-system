ALTER TYPE "public"."portal" ADD VALUE 'owner';--> statement-breakpoint
CREATE TABLE "owner_totp" (
	"identity_id" integer PRIMARY KEY NOT NULL,
	"secret" text,
	"pending_secret" text,
	"last_step" bigint,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "owner_totp" ADD CONSTRAINT "owner_totp_identity_id_login_identity_id_fk" FOREIGN KEY ("identity_id") REFERENCES "public"."login_identity"("id") ON DELETE cascade ON UPDATE no action;