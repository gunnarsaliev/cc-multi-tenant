import type { Endpoint, Payload } from 'payload'

import { z } from 'zod'

import { DEFAULT_TEXTS, EDITABLE_TEXTS } from './defaults'
import { isAllowedOrigin } from './origin'

const findTenant = async (payload: Payload, slug: string) => {
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

  return tenant
}

const configQuerySchema = z.object({
  locale: z.string().optional(),
  tenant: z.string().min(1),
})

/**
 * GET /api/consent/config?tenant=<slug>&locale=<code>
 *
 * A tenant's cookie banner settings. Public, because every visitor's browser needs them.
 * Anything the tenant has left blank comes back as the default text for that locale.
 */
export const consentConfigEndpoint: Endpoint = {
  handler: async (req) => {
    const headers = { 'Access-Control-Allow-Origin': '*' }
    const parsed = configQuerySchema.safeParse(Object.fromEntries(new URL(req.url!).searchParams))

    if (!parsed.success) {
      return Response.json({ error: 'Invalid request.' }, { headers, status: 400 })
    }

    const { payload } = req
    const localization = payload.config.localization
    const locale = parsed.data.locale ?? (localization ? localization.defaultLocale : 'en')

    if (localization && !localization.localeCodes.includes(locale)) {
      return Response.json({ error: 'Unknown locale.' }, { headers, status: 400 })
    }

    const tenant = await findTenant(payload, parsed.data.tenant)

    if (!tenant) {
      return Response.json({ error: 'Tenant not found.' }, { headers, status: 404 })
    }

    const {
      docs: [settings],
    } = await payload.find({
      collection: 'consent-settings',
      depth: 0,
      // A blank Bulgarian text should become the Bulgarian default, not the English override.
      fallbackLocale: false,
      limit: 1,
      locale: locale as never,
      overrideAccess: true,
      where: { tenant: { equals: tenant.id } },
    })

    const texts = { ...(DEFAULT_TEXTS[locale] ?? DEFAULT_TEXTS.en) }

    for (const key of EDITABLE_TEXTS) {
      const value = settings?.[key]?.trim()

      if (value) {
        texts[key] = value
      }
    }

    return Response.json(
      {
        categories: {
          analytics: settings?.analyticsEnabled ?? true,
          marketing: settings?.marketingEnabled ?? true,
          preferences: settings?.preferencesEnabled ?? true,
        },
        locale,
        privacyPolicyUrl: settings?.privacyPolicyUrl || null,
        revision: settings?.revision ?? 0,
        tenant: tenant.slug,
        texts,
      },
      { headers: { ...headers, 'Cache-Control': 'public, max-age=60' } },
    )
  },
  method: 'get',
  path: '/consent/config',
}

const logBodySchema = z.object({
  analytics: z.boolean(),
  consentId: z.string().trim().min(1).max(100),
  marketing: z.boolean(),
  // Optional so banners written before this category existed keep working.
  preferences: z.boolean().default(false),
  revision: z.number().int().min(0).optional(),
  tenant: z.string().min(1),
  url: z.string().max(2000).optional(),
})

const corsFor = (origin: string) => ({
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Origin': origin,
  Vary: 'Origin',
})

/**
 * POST /api/consent/log
 *
 * Records one consent decision. Only a browser on the tenant's own domain is accepted, so the
 * tenant's `domain` has to match the address of its site.
 */
export const consentLogEndpoint: Endpoint = {
  handler: async (req) => {
    const body = await req.json?.().catch(() => null)
    const parsed = logBodySchema.safeParse(body)

    if (!parsed.success) {
      return Response.json({ error: 'Invalid consent record.' }, { status: 400 })
    }

    const { payload } = req
    const { analytics, consentId, marketing, preferences, revision, tenant: slug, url } = parsed.data
    const tenant = await findTenant(payload, slug)
    const origin = req.headers.get('origin')

    // No CORS headers here: an unknown tenant and a foreign site get the same answer.
    if (!tenant || !origin || !isAllowedOrigin(origin, tenant.domain)) {
      return Response.json({ error: 'Not allowed.' }, { status: 403 })
    }

    await payload.create({
      collection: 'consent-logs',
      data: { analytics, consentId, marketing, preferences, revision, tenant: tenant.id, url },
      overrideAccess: true,
    })

    return Response.json({ success: true }, { headers: corsFor(origin), status: 201 })
  },
  method: 'post',
  path: '/consent/log',
}

/** The browser's preflight carries no body, so the tenant check is left to the POST. */
export const consentLogPreflightEndpoint: Endpoint = {
  handler: (req) => {
    const origin = req.headers.get('origin')

    return new Response(null, { headers: origin ? corsFor(origin) : {}, status: 204 })
  },
  method: 'options',
  path: '/consent/log',
}
