import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "consent_settings" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"analytics_enabled" boolean DEFAULT true,
  	"marketing_enabled" boolean DEFAULT true,
  	"privacy_policy_url" varchar,
  	"revision" numeric DEFAULT 0,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "consent_settings_locales" (
  	"title" varchar,
  	"description" varchar,
  	"accept_all_label" varchar,
  	"reject_all_label" varchar,
  	"manage_label" varchar,
  	"preferences_title" varchar,
  	"save_label" varchar,
  	"necessary_description" varchar,
  	"analytics_description" varchar,
  	"marketing_description" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "consent_logs" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"consent_id" varchar NOT NULL,
  	"analytics" boolean DEFAULT false NOT NULL,
  	"marketing" boolean DEFAULT false NOT NULL,
  	"revision" numeric,
  	"url" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "consent_settings_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "consent_logs_id" integer;
  ALTER TABLE "consent_settings" ADD CONSTRAINT "consent_settings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "consent_settings_locales" ADD CONSTRAINT "consent_settings_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."consent_settings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "consent_logs" ADD CONSTRAINT "consent_logs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  CREATE UNIQUE INDEX "consent_settings_tenant_idx" ON "consent_settings" USING btree ("tenant_id");
  CREATE INDEX "consent_settings_updated_at_idx" ON "consent_settings" USING btree ("updated_at");
  CREATE INDEX "consent_settings_created_at_idx" ON "consent_settings" USING btree ("created_at");
  CREATE UNIQUE INDEX "consent_settings_locales_locale_parent_id_unique" ON "consent_settings_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "consent_settings_locales_parent_id_idx" ON "consent_settings_locales" USING btree ("_parent_id");
  CREATE INDEX "consent_logs_tenant_idx" ON "consent_logs" USING btree ("tenant_id");
  CREATE INDEX "consent_logs_consent_id_idx" ON "consent_logs" USING btree ("consent_id");
  CREATE INDEX "consent_logs_updated_at_idx" ON "consent_logs" USING btree ("updated_at");
  CREATE INDEX "consent_logs_created_at_idx" ON "consent_logs" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_consent_settings_fk" FOREIGN KEY ("consent_settings_id") REFERENCES "public"."consent_settings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_consent_logs_fk" FOREIGN KEY ("consent_logs_id") REFERENCES "public"."consent_logs"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_consent_settings_id_idx" ON "payload_locked_documents_rels" USING btree ("consent_settings_id");
  CREATE INDEX "payload_locked_documents_rels_consent_logs_id_idx" ON "payload_locked_documents_rels" USING btree ("consent_logs_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "consent_settings" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "consent_settings_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "consent_logs" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "consent_settings" CASCADE;
  DROP TABLE "consent_settings_locales" CASCADE;
  DROP TABLE "consent_logs" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_consent_settings_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_consent_logs_fk";
  
  DROP INDEX "payload_locked_documents_rels_consent_settings_id_idx";
  DROP INDEX "payload_locked_documents_rels_consent_logs_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "consent_settings_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "consent_logs_id";`)
}
