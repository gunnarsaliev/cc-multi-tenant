import type { Payload } from 'payload'

import { sql } from '@payloadcms/db-postgres/drizzle'
import { embed } from 'ai'

import { getEmbeddingModel, getEmbeddingModelID } from '@/ai/models'

import { getDatabase } from './db'

const CANDIDATES = 50
const RRF_K = 60
/**
 * Vector search always returns its nearest rows, however unrelated. Rows further away than this
 * are dropped, unless full-text search also matched them. Tune with real content and queries.
 */
const MAX_VECTOR_DISTANCE = Number(process.env.SEARCH_MAX_VECTOR_DISTANCE ?? 0.85)

export type SearchResult = {
  chunkIndex: number
  collection: string
  content: string
  docID: number
  heading: null | string
  score: number
  slug: null | string
  title: null | string
}

type Row = {
  chunk_index: number
  collection: string
  content: string
  doc_id: number
  heading: null | string
  score: number
  slug: null | string
  title: null | string
}

/**
 * Hybrid search within one tenant and locale. Callers must establish that the caller may see
 * `tenantId`; the index only ever holds published content.
 */
export const searchContent = async ({
  limit = 10,
  locale,
  payload,
  query,
  tenantId,
}: {
  limit?: number
  locale: string
  payload: Payload
  query: string
  tenantId: number
}): Promise<SearchResult[]> => {
  const { embedding } = await embed({ model: await getEmbeddingModel(), value: query })
  const vector = JSON.stringify(embedding)
  const textConfig = locale === 'en' ? 'english' : 'simple'
  const modelID = getEmbeddingModelID()

  const rows = await getDatabase(payload).transaction(async (tx) => {
    // HNSW applies WHERE after scanning, so a small tenant could otherwise get too few rows back.
    await tx.execute(sql`SET LOCAL hnsw.iterative_scan = relaxed_order`)
    await tx.execute(sql`SET LOCAL hnsw.ef_search = 100`)

    const result = await tx.execute(sql`
      WITH nearest AS MATERIALIZED (
        SELECT id, embedding <=> ${vector}::vector AS distance
        FROM content_chunks
        WHERE tenant_id = ${tenantId} AND locale = ${locale} AND model = ${modelID}
        ORDER BY embedding <=> ${vector}::vector
        LIMIT ${CANDIDATES}
      ),
      semantic AS (
        -- Relaxed scans can come back slightly out of order.
        SELECT id, row_number() OVER (ORDER BY distance) AS position
        FROM nearest
        WHERE distance <= ${MAX_VECTOR_DISTANCE}
      ),
      lexical AS (
        SELECT id, row_number() OVER (
          ORDER BY ts_rank_cd(search_vector, websearch_to_tsquery(${textConfig}::regconfig, ${query})) DESC
        ) AS position
        FROM content_chunks
        WHERE tenant_id = ${tenantId} AND locale = ${locale}
          AND search_vector @@ websearch_to_tsquery(${textConfig}::regconfig, ${query})
        LIMIT ${CANDIDATES}
      ),
      fused AS (
        SELECT
          coalesce(semantic.id, lexical.id) AS id,
          coalesce(1.0 / (${RRF_K} + semantic.position), 0)
            + coalesce(1.0 / (${RRF_K} + lexical.position), 0) AS score
        FROM semantic
        FULL OUTER JOIN lexical ON semantic.id = lexical.id
      ),
      -- The best chunk per document, so one long post can't fill the page.
      best AS (
        SELECT DISTINCT ON (chunk.collection, chunk.doc_id)
          chunk.collection, chunk.doc_id, chunk.chunk_index, chunk.slug, chunk.title,
          chunk.heading, chunk.content, fused.score::float8 AS score
        FROM fused
        JOIN content_chunks chunk ON chunk.id = fused.id
        ORDER BY chunk.collection, chunk.doc_id, fused.score DESC
      )
      SELECT * FROM best ORDER BY score DESC LIMIT ${limit}`)

    return result.rows as Row[]
  })

  return rows.map((row) => ({
    chunkIndex: row.chunk_index,
    collection: row.collection,
    content: row.content,
    docID: row.doc_id,
    heading: row.heading,
    score: row.score,
    slug: row.slug,
    title: row.title,
  }))
}
