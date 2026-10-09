CREATE TABLE "post_members" (
	"post_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	CONSTRAINT "post_members_post_id_user_id_pk" PRIMARY KEY("post_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "posts" (
	"id" serial PRIMARY KEY NOT NULL,
	"department_id" integer NOT NULL,
	"name" text NOT NULL,
	"restricted" boolean DEFAULT false NOT NULL,
	CONSTRAINT "posts_department_id_name_unique" UNIQUE("department_id","name")
);
--> statement-breakpoint
ALTER TABLE "shift_slots" ADD COLUMN "post_id" integer;--> statement-breakpoint
-- 既存の枠は、部門ごとの既定の持ち場「全体」（誰でも可）に所属させる
INSERT INTO "posts" ("department_id", "name") SELECT DISTINCT "department_id", '全体' FROM "shift_slots";--> statement-breakpoint
UPDATE "shift_slots" s SET "post_id" = p."id" FROM "posts" p WHERE p."department_id" = s."department_id" AND p."name" = '全体';--> statement-breakpoint
ALTER TABLE "shift_slots" ALTER COLUMN "post_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "post_members" ADD CONSTRAINT "post_members_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_members" ADD CONSTRAINT "post_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_slots" ADD CONSTRAINT "shift_slots_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE restrict ON UPDATE no action;