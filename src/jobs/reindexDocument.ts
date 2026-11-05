import type { TaskConfig } from 'payload'

import { indexDocument, type IndexedCollection, INDEXED_COLLECTIONS } from '@/search/indexDocument'

export const reindexDocumentTask = {
  slug: 'reindexDocument',
  handler: async ({ input, req }) => {
    const result = await indexDocument({
      collection: input.collection as IndexedCollection,
      id: input.id,
      payload: req.payload,
    })

    if (result === 'not-configured') {
      // Not a failure to retry: `pnpm search:backfill` covers this once keys are added.
      req.payload.logger.info(`Skipped indexing ${input.collection} ${input.id}: no embedding model.`)
    }

    return { output: { result } }
  },
  inputSchema: [
    {
      name: 'collection',
      type: 'select',
      options: [...INDEXED_COLLECTIONS],
      required: true,
    },
    { name: 'id', type: 'number', required: true },
  ],
  outputSchema: [{ name: 'result', type: 'text', required: true }],
  retries: 3,
} satisfies TaskConfig<any>
