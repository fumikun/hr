CREATE TYPE "public"."assignment_source" AS ENUM('auto', 'manual');--> statement-breakpoint
CREATE TYPE "public"."assignment_status" AS ENUM('draft', 'confirmed');--> statement-breakpoint
CREATE TYPE "public"."availability_type" AS ENUM('want', 'ok', 'ng');--> statement-breakpoint
CREATE TABLE "assignments" (
	"user_id" integer NOT NULL,
	"slot_id" integer NOT NULL,
	"source" "assignment_source" NOT NULL,
	"locked" boolean DEFAULT false NOT NULL,
	"status" "assignment_status" DEFAULT 'draft' NOT NULL,
	CONSTRAINT "assignments_user_id_slot_id_pk" PRIMARY KEY("user_id","slot_id")
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"actor_id" integer,
	"action" text NOT NULL,
	"target" text,
	"before" jsonb,
	"after" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "availabilities" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"department_id" integer,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"type" "availability_type" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "departments" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "departments_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shift_slots" (
	"id" serial PRIMARY KEY NOT NULL,
	"department_id" integer NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"min_people" integer DEFAULT 1 NOT NULL,
	"max_people" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"user_id" integer NOT NULL,
	"department_id" integer NOT NULL,
	"requires_availability" boolean DEFAULT true NOT NULL,
	"confirmed_at" timestamp with time zone,
	CONSTRAINT "user_roles_user_id_department_id_pk" PRIMARY KEY("user_id","department_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"is_admin" boolean DEFAULT false NOT NULL,
	"target_minutes" integer,
	"max_minutes" integer,
	"first_login_confirmed_at" timestamp with time zone,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_slot_id_shift_slots_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."shift_slots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availabilities" ADD CONSTRAINT "availabilities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availabilities" ADD CONSTRAINT "availabilities_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_slots" ADD CONSTRAINT "shift_slots_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE cascade ON UPDATE no action;