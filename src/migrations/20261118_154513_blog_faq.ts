import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "blog_faq" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"question" varchar,
  	"answer" jsonb
  );
  
  CREATE TABLE "_blog_v_version_faq" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"question" varchar,
  	"answer" jsonb,
  	"_uuid" varchar
  );
  
  ALTER TABLE "blog_faq" ADD CONSTRAINT "blog_faq_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."blog"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_blog_v_version_faq" ADD CONSTRAINT "_blog_v_version_faq_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_blog_v"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "blog_faq_order_idx" ON "blog_faq" USING btree ("_order");
  CREATE INDEX "blog_faq_parent_id_idx" ON "blog_faq" USING btree ("_parent_id");
  CREATE INDEX "blog_faq_locale_idx" ON "blog_faq" USING btree ("_locale");
  CREATE INDEX "_blog_v_version_faq_order_idx" ON "_blog_v_version_faq" USING btree ("_order");
  CREATE INDEX "_blog_v_version_faq_parent_id_idx" ON "_blog_v_version_faq" USING btree ("_parent_id");
  CREATE INDEX "_blog_v_version_faq_locale_idx" ON "_blog_v_version_faq" USING btree ("_locale");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "blog_faq" CASCADE;
  DROP TABLE "_blog_v_version_faq" CASCADE;`)
}
