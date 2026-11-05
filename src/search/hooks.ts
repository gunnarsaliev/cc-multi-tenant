import type { CollectionAfterChangeHook, CollectionAfterDeleteHook } from 'payload'

import type { IndexedCollection } from './indexDocument'

/**
 * Saves only queue a job, so they stay fast and a failed embedding call can be retried.
 * Draft saves on a post that has never been published can't affect the index.
 */
export const queueReindexAfterChange: CollectionAfterChangeHook = async ({
  collection,
  doc,
  previousDoc,
  req,
}) => {
  if (doc._status !== 'draft' || previousDoc?._status === 'published') {
    await req.payload.jobs.queue({
      input: { collection: collection.slug as IndexedCollection, id: doc.id },
      req,
      task: 'reindexDocument',
    })
  }

  return doc
}

export const queueReindexAfterDelete: CollectionAfterDeleteHook = async ({
  collection,
  doc,
  req,
}) => {
  await req.payload.jobs.queue({
    input: { collection: collection.slug as IndexedCollection, id: doc.id },
    req,
    task: 'reindexDocument',
  })

  return doc
}
