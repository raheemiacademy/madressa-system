ALTER TABLE "owner_action" DROP CONSTRAINT "owner_action_kind";--> statement-breakpoint
ALTER TABLE "owner_action" ADD COLUMN "address" text;--> statement-breakpoint
ALTER TABLE "owner_action" ADD COLUMN "demo" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "owner_action" ADD CONSTRAINT "owner_action_kind" CHECK ("owner_action"."action" in ('restart', 'backup', 'add', 'suspend', 'resume', 'remove'));