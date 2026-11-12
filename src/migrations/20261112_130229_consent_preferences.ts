import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "consent_settings" ADD COLUMN "preferences_enabled" boolean DEFAULT true;
  ALTER TABLE "consent_settings_locales" ADD COLUMN "preferences_description" varchar;
  ALTER TABLE "consent_logs" ADD COLUMN "preferences" boolean DEFAULT false NOT NULL;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "consent_settings" DROP COLUMN "preferences_enabled";
  ALTER TABLE "consent_settings_locales" DROP COLUMN "preferences_description";
  ALTER TABLE "consent_logs" DROP COLUMN "preferences";`)
}
