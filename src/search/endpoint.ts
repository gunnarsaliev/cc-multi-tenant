import type { Endpoint } from 'payload'

import { z } from 'zod'

import type { User } from '@/payload-types'

import { isEmbeddingAIConfigured } from '@/ai/models'
import { isSuperAdmin } from '@/access/isSuperAdmin'
import { getUserTenantIDs } from '@/utilities/getUserTenantIDs'

import { searchContent } from './searchContent'

const MAX_QUERY_LENGTH = 500

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional(),
  locale: z.string().optional(),
  q: z.string().trim().min(1).max(MAX_QUERY_LENGTH),
  tenant: z.string().min(1),
})

/**
 * GET /api/search?tenant=<slug>&q=<text>&locale=<code>
 *
 * The tenant is resolved here from its slug. Visitors can search a tenant that allows public
 * read, and signed-in users can search their own. Anything else looks like an unknown tenant.
 */
export const searchEndpoint: Endpoint = {
  handler: async (req) => {
    const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url!).searchParams))

    if (!parsed.success) {
      return Response.json({ error: 'Invalid search request.' }, { status: 400 })
    }

    const { payload } = req
    const { limit, locale, q, tenant: slug } = parsed.data
    const localization = payload.config.localization
    const resolvedLocale = locale ?? (localization ? localization.defaultLocale : 'en')

    if (localization && !localization.localeCodes.includes(resolvedLocale)) {
      return Response.json({ error: 'Unknown locale.' }, { status: 400 })
    }

    // Visitors can't read `tenants`, so this one lookup bypasses access control.
    const {
      docs: [tenant],
    } = await payload.find({
      collection: 'tenants',
      depth: 0,
      limit: 1,
      overrideAccess: true,
      where: { slug: { equals: slug } },
    })

    const user = req.user?.collection === 'users' ? (req.user as User) : null
    const isAllowed =
      tenant &&
      (tenant.allowPublicRead ||
        isSuperAdmin(user) ||
        getUserTenantIDs(user).includes(tenant.id))

    if (!isAllowed) {
      return Response.json({ error: 'Tenant not found.' }, { status: 404 })
    }

    if (!isEmbeddingAIConfigured()) {
      return Response.json({ error: 'Search is not configured.' }, { status: 503 })
    }

    const results = await searchContent({
      limit,
      locale: resolvedLocale,
      payload,
      query: q,
      tenantId: tenant.id,
    })

    return Response.json({ results })
  },
  method: 'get',
  path: '/search',
}
