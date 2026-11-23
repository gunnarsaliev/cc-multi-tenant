import type { PaginatedDocs, Payload, TypedLocale } from 'payload'

import { sql } from '@payloadcms/db-postgres/drizzle'
import { embedMany } from 'ai'
import { createHash } from 'node:crypto'

import type { LexicalState } from '@/translation/lexical'

import { getEmbeddingModel, getEmbeddingModelID, isEmbeddingAIConfigured } from '@/ai/models'
import { extractID } from '@/utilities/extractID'

import { chunkContent, chunkFAQ } from './chunkContent'
import { getDatabase } from './db'

export const INDEXED_COLLECTIONS = ['blog', 'pages'] as const

export type IndexedCollection = (typeof INDEXED_COLLECTIONS)[number]

type LocalizedDoc = {
  _status?: 'draft' | 'published' | null
  content?: null | Record<string, LexicalState | null>
  faq?: null | Record<string, { answer?: LexicalState | null; question?: null | string }[] | null>
  slug?: null | string
  tenant?: unknown
  title?: null | Record<string, null | string>
}

type ExistingChunk = { chunk_index: number; content_hash: string; locale: string }

const removeChunks = (payload: Payload, collection: string, id: number) =>
  getDatabase(payload).execute(
    sql`DELETE FROM content_chunks WHERE collection = ${collection} AND doc_id = ${id}`,
  )

export type IndexResult = 'indexed' | 'not-configured' | 'removed'

/**
 * Brings a document's chunks in line with its published content, in every locale.
 * Only chunks whose text changed are embedded again.
 */
export const indexDocument = async ({
  collection,
  id,
  payload,
}: {
  collection: IndexedCollection
  id: number
  payload: Payload
}): Promise<IndexResult> => {
  // The main table holds the published version; drafts live in the versions table.
  // `locale: 'all'` gives each locale's own value, so English is never stored as Bulgarian.
  const doc = (await payload.findByID({
    collection,
    depth: 0,
    disableErrors: true,
    draft: false,
    id,
    locale: 'all' as TypedLocale,
  })) as LocalizedDoc | null

  if (!doc || !doc.tenant || doc._status === 'draft') {
    await removeChunks(payload, collection, id)
    return 'removed'
  }

  if (!isEmbeddingAIConfigured()) {
    return 'not-configured'
  }

  const tenantID = extractID(doc.tenant as number)
  const modelID = getEmbeddingModelID()
  const locales = payload.config.localization ? payload.config.localization.localeCodes : []

  const wanted = locales.flatMap((locale) => {
    const title = doc.title?.[locale]

    const chunks = [
      ...chunkContent(title, doc.content?.[locale]),
      ...chunkFAQ(doc.faq?.[locale]),
    ]

    return chunks.map((chunk, chunkIndex) => {
      const embedText = [title, chunk.heading, chunk.content].filter(Boolean).join('\n\n')

      return {
        ...chunk,
        chunkIndex,
        embedText,
        // Anything stored with the chunk counts, so a moved or renamed document is rewritten.
        hash: createHash('sha256')
          .update(JSON.stringify([modelID, tenantID, doc.slug, embedText]))
          .digest('hex'),
        locale,
        title: title ?? null,
      }
    })
  })

  const database = getDatabase(payload)
  const { rows } = await database.execute(
    sql`SELECT locale, chunk_index, content_hash FROM content_chunks
        WHERE collection = ${collection} AND doc_id = ${id}`,
  )
  const existing = new Map(
    (rows as ExistingChunk[]).map((row) => [`${row.locale}:${row.chunk_index}`, row.content_hash]),
  )
  const changed = wanted.filter(
    (chunk) => existing.get(`${chunk.locale}:${chunk.chunkIndex}`) !== chunk.hash,
  )

  const embeddings =
    changed.length === 0
      ? []
      : (
          await embedMany({
            maxParallelCalls: 2,
            model: await getEmbeddingModel(),
            values: changed.map((chunk) => chunk.embedText),
          })
        ).embeddings

  const keep = new Set(wanted.map((chunk) => `${chunk.locale}:${chunk.chunkIndex}`))
  const stale = [...existing.keys()].filter((key) => !keep.has(key))

  await database.transaction(async (tx) => {
    for (const key of stale) {
      const [locale, chunkIndex] = key.split(':')

      await tx.execute(
        sql`DELETE FROM content_chunks WHERE collection = ${collection} AND doc_id = ${id}
            AND locale = ${locale} AND chunk_index = ${Number(chunkIndex)}`,
      )
    }

    for (const [position, chunk] of changed.entries()) {
      const embedding = JSON.stringify(embeddings[position])

      await tx.execute(sql`
        INSERT INTO content_chunks
          (tenant_id, collection, doc_id, locale, chunk_index, slug, title, heading, content,
           content_hash, embedding, model, updated_at)
        VALUES
          (${tenantID}, ${collection}, ${id}, ${chunk.locale}, ${chunk.chunkIndex}, ${doc.slug ?? null},
           ${chunk.title}, ${chunk.heading}, ${chunk.content}, ${chunk.hash},
           ${embedding}::vector, ${modelID}, now())
        ON CONFLICT (collection, doc_id, locale, chunk_index) DO UPDATE SET
          tenant_id = EXCLUDED.tenant_id, slug = EXCLUDED.slug, title = EXCLUDED.title,
          heading = EXCLUDED.heading, content = EXCLUDED.content,
          content_hash = EXCLUDED.content_hash, embedding = EXCLUDED.embedding,
          model = EXCLUDED.model, updated_at = now()`)
    }
  })

  return 'indexed'
}

/** Reindexes everything, for the first backfill or after changing embedding model. */
export const indexAllDocuments = async (payload: Payload) => {
  const totals: Record<IndexResult, number> = { indexed: 0, 'not-configured': 0, removed: 0 }

  for (const collection of INDEXED_COLLECTIONS) {
    let page: null | number | undefined = 1

    while (page) {
      const result: PaginatedDocs<{ id: number }> = await payload.find({
        collection,
        depth: 0,
        limit: 100,
        page,
        pagination: true,
        select: {},
      })

      for (const { id } of result.docs) {
        totals[await indexDocument({ collection, id, payload })]++
      }

      page = result.nextPage
    }
  }

  return totals
}
