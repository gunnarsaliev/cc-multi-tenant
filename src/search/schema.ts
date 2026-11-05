import type { PostgresAdapterArgs } from '@payloadcms/db-postgres'

import { sql } from '@payloadcms/db-postgres/drizzle'
import {
  customType,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  vector,
} from '@payloadcms/db-postgres/drizzle/pg-core'

import { EMBEDDING_DIMENSIONS } from '@/ai/models'

const tsvector = customType<{ data: string }>({
  dataType: () => 'tsvector',
})

type SchemaHook = NonNullable<PostgresAdapterArgs['afterSchemaInit']>[number]

/**
 * Registers `content_chunks` with Payload's Drizzle schema, so migrations manage it.
 * Runs after the schema is built because of the foreign key to `tenants`.
 *
 * Postgres has no Bulgarian text search config, so other locales use `simple`.
 */
export const addContentChunksTable: SchemaHook = ({ schema }) => {
  const tenants = schema.tables.tenants as unknown as { id: never }

  const contentChunks = pgTable(
    'content_chunks',
    {
      id: serial('id').primaryKey(),
      chunkIndex: integer('chunk_index').notNull(),
      collection: text('collection').notNull(),
      content: text('content').notNull(),
      contentHash: text('content_hash').notNull(),
      docID: integer('doc_id').notNull(),
      embedding: vector('embedding', { dimensions: EMBEDDING_DIMENSIONS }).notNull(),
      heading: text('heading'),
      locale: text('locale').notNull(),
      model: text('model').notNull(),
      searchVector: tsvector('search_vector').generatedAlwaysAs(
        sql`to_tsvector(
          CASE locale WHEN 'en' THEN 'english'::regconfig ELSE 'simple'::regconfig END,
          coalesce(title, '') || ' ' || coalesce(heading, '') || ' ' || content
        )`,
      ),
      slug: text('slug'),
      tenantID: integer('tenant_id')
        .notNull()
        .references(() => tenants.id, { onDelete: 'cascade' }),
      title: text('title'),
      updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    },
    (table) => [
      uniqueIndex('content_chunks_position_idx').on(
        table.collection,
        table.docID,
        table.locale,
        table.chunkIndex,
      ),
      index('content_chunks_scope_idx').on(table.tenantID, table.locale),
      index('content_chunks_embedding_idx').using('hnsw', table.embedding.op('vector_cosine_ops')),
      index('content_chunks_search_vector_idx').using('gin', table.searchVector),
    ],
  )

  return { ...schema, tables: { ...schema.tables, content_chunks: contentChunks } }
}
