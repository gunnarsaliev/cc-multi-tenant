import type { CollectionBeforeDeleteHook, PayloadRequest } from 'payload'

import { extractID } from '@/utilities/extractID'

const removeTenant = async (id: number | string, req: PayloadRequest) => {
  const { docs } = await req.payload.find({
    collection: 'users',
    depth: 0,
    limit: 0,
    pagination: false,
    req,
    where: { 'tenants.tenant': { equals: id } },
  })

  for (const user of docs) {
    await req.payload.update({
      collection: 'users',
      data: {
        tenants: (user.tenants ?? []).filter((row) => String(extractID(row.tenant)) !== String(id)),
      },
      depth: 0,
      id: user.id,
      req,
    })
  }
}

/** The last cleanup queued for each request. */
const queues = new WeakMap<PayloadRequest, Promise<unknown>>()

/**
 * A user's tenant row cannot have an empty tenant, so deleting a tenant that users are assigned
 * to fails in the database (it would set the row's tenant to null). The multi-tenant plugin
 * removes those rows in `afterDelete`, which is too late, so they are removed here first.
 *
 * A bulk delete runs this for every tenant at once in the same transaction. Each run rewrites
 * the user's whole tenant list, so runs from the same request wait for each other; otherwise
 * they would overwrite each other's changes and collide on the list's rows.
 */
export const removeFromUsers: CollectionBeforeDeleteHook = async ({ id, req }) => {
  const previous = queues.get(req) ?? Promise.resolve()
  const current = previous.catch(() => undefined).then(() => removeTenant(id, req))

  queues.set(req, current)
  await current
}
