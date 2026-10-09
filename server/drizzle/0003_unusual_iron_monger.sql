CREATE TABLE "assignment_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"status" text NOT NULL,
	"phase" text DEFAULT 'queued' NOT NULL,
	"started_by" integer,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"options" jsonb,
	"result" jsonb,
	"error" text
);
--> statement-breakpoint
ALTER TABLE "assignment_runs" ADD CONSTRAINT "assignment_runs_started_by_users_id_fk" FOREIGN KEY ("started_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;