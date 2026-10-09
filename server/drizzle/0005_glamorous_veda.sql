CREATE TABLE "scope_settings" (
	"scope_type" text NOT NULL,
	"scope_id" integer NOT NULL,
	"opens_at" timestamp with time zone,
	"closes_at" timestamp with time zone,
	"days" text[],
	CONSTRAINT "scope_settings_scope_type_scope_id_pk" PRIMARY KEY("scope_type","scope_id")
);
