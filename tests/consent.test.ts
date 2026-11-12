import type { Payload } from 'payload'

import { beforeAll, describe, expect, it } from 'vitest'

import type { Tenant } from '@/payload-types'

import {
  consentConfigEndpoint,
  consentLogEndpoint,
  consentLogPreflightEndpoint,
} from '@/consent/endpoints'
import { isAllowedOrigin } from '@/consent/origin'

import { createTenant, createUser, getTestPayload, unique } from './helpers/payload'

type Handler = (req: never) => Promise<Response> | Response

describe('consent', () => {
  let payload: Payload
  let tenantA: Tenant
  let tenantB: Tenant

  const getConfig = (params: Record<string, string>) =>
    (consentConfigEndpoint.handler as Handler)({
      payload,
      url: `http://test/api/consent/config?${new URLSearchParams(params)}`,
    } as never)

  const postLog = (body: unknown, origin?: string) =>
    (consentLogEndpoint.handler as Handler)({
      headers: new Headers(origin ? { origin } : {}),
      json: async () => body,
      payload,
    } as never)

  const record = (tenant: Tenant, overrides: Record<string, unknown> = {}) => ({
    analytics: true,
    consentId: unique('consent'),
    marketing: false,
    revision: 0,
    tenant: tenant.slug,
    url: `https://${tenant.domain}/`,
    ...overrides,
  })

  const logsFor = async (consentId: string) =>
    (
      await payload.find({
        collection: 'consent-logs',
        depth: 0,
        where: { consentId: { equals: consentId } },
      })
    ).docs

  beforeAll(async () => {
    payload = await getTestPayload()
    tenantA = await createTenant(payload)
    tenantB = await createTenant(payload)
  })

  describe('origin check', () => {
    it('accepts the tenant domain, with or without www, and nothing else', () => {
      expect(isAllowedOrigin('https://shop.example', 'shop.example')).toBe(true)
      expect(isAllowedOrigin('https://www.shop.example', 'shop.example')).toBe(true)
      expect(isAllowedOrigin('https://shop.example', 'https://www.shop.example/')).toBe(true)
      expect(isAllowedOrigin('https://evil.example', 'shop.example')).toBe(false)
      expect(isAllowedOrigin('https://shop.example.evil.example', 'shop.example')).toBe(false)
      expect(isAllowedOrigin('https://shop.example', null)).toBe(false)
      expect(isAllowedOrigin(null, 'shop.example')).toBe(false)
    })
  })

  describe('config endpoint', () => {
    it('returns default texts in the requested language before anything is edited', async () => {
      const response = await getConfig({ locale: 'bg', tenant: tenantA.slug })
      const config = await response.json()

      expect(response.status).toBe(200)
      expect(response.headers.get('access-control-allow-origin')).toBe('*')
      expect(config).toMatchObject({
        categories: { analytics: true, marketing: true, preferences: true },
        locale: 'bg',
        revision: 0,
        tenant: tenantA.slug,
        texts: { title: 'Използваме бисквитки' },
      })
    })

    it('returns the tenant’s own settings, and only that tenant’s', async () => {
      await payload.create({
        collection: 'consent-settings',
        data: {
          marketingEnabled: false,
          privacyPolicyUrl: 'https://a.example/privacy',
          revision: 3,
          tenant: tenantA.id,
          title: 'Cookies at A',
        },
        locale: 'en',
      })

      const a = await (await getConfig({ tenant: tenantA.slug })).json()
      const b = await (await getConfig({ tenant: tenantB.slug })).json()

      expect(a).toMatchObject({
        categories: { analytics: true, marketing: false, preferences: true },
        privacyPolicyUrl: 'https://a.example/privacy',
        revision: 3,
        texts: { acceptAllLabel: 'Accept all', title: 'Cookies at A' },
      })
      expect(b).toMatchObject({ revision: 0, texts: { title: 'We use cookies' } })

      // The English override must not leak into Bulgarian.
      const bg = await (await getConfig({ locale: 'bg', tenant: tenantA.slug })).json()
      expect(bg.texts.title).toBe('Използваме бисквитки')
    })

    it('rejects unknown tenants and locales', async () => {
      expect((await getConfig({ tenant: 'nope' })).status).toBe(404)
      expect((await getConfig({ locale: 'xx', tenant: tenantA.slug })).status).toBe(400)
      expect((await getConfig({})).status).toBe(400)
    })
  })

  describe('log endpoint', () => {
    it('records a consent sent from the tenant’s own site', async () => {
      const body = record(tenantA)
      const origin = `https://${tenantA.domain}`
      const response = await postLog(body, origin)

      expect(response.status).toBe(201)
      expect(response.headers.get('access-control-allow-origin')).toBe(origin)
      expect(await logsFor(body.consentId)).toMatchObject([
        { analytics: true, marketing: false, preferences: false, tenant: tenantA.id, url: body.url },
      ])
    })

    it('records the preferences category when the banner sends it', async () => {
      const body = record(tenantA, { preferences: true })

      expect((await postLog(body, `https://${tenantA.domain}`)).status).toBe(201)
      expect(await logsFor(body.consentId as string)).toMatchObject([{ preferences: true }])
    })

    it('refuses other sites, missing origins and unknown tenants', async () => {
      const fromElsewhere = record(tenantA)
      const fromOtherTenant = record(tenantA)
      const noOrigin = record(tenantA)

      expect((await postLog(fromElsewhere, 'https://evil.example')).status).toBe(403)
      expect((await postLog(fromOtherTenant, `https://${tenantB.domain}`)).status).toBe(403)
      expect((await postLog(noOrigin)).status).toBe(403)
      expect((await postLog(record(tenantA, { tenant: 'nope' }), 'https://evil.example')).status).toBe(403)

      for (const { consentId } of [fromElsewhere, fromOtherTenant, noOrigin]) {
        expect(await logsFor(consentId)).toHaveLength(0)
      }
    })

    it('refuses malformed records', async () => {
      const origin = `https://${tenantA.domain}`

      expect((await postLog({ tenant: tenantA.slug }, origin)).status).toBe(400)
      expect((await postLog(record(tenantA, { analytics: 'yes' }), origin)).status).toBe(400)
      expect((await postLog(record(tenantA, { url: 'x'.repeat(2001) }), origin)).status).toBe(400)
      expect((await postLog(null, origin)).status).toBe(400)
    })

    it('answers the browser preflight for the calling origin', async () => {
      const response = await (consentLogPreflightEndpoint.handler as Handler)({
        headers: new Headers({ origin: 'https://shop.example' }),
      } as never)

      expect(response.status).toBe(204)
      expect(response.headers.get('access-control-allow-origin')).toBe('https://shop.example')
      expect(response.headers.get('access-control-allow-headers')).toBe('Content-Type')
    })
  })

  describe('log access', () => {
    it('lets tenant admins read only their own tenant’s log, and nobody change it', async () => {
      const body = record(tenantA)
      await postLog(body, `https://${tenantA.domain}`)
      const [log] = await logsFor(body.consentId)

      const adminA = await createUser(payload, [{ roles: ['tenant-admin'], tenant: tenantA.id }])
      const adminB = await createUser(payload, [{ roles: ['tenant-admin'], tenant: tenantB.id }])
      const viewerA = await createUser(payload, [{ roles: ['tenant-viewer'], tenant: tenantA.id }])
      const superAdmin = await createUser(payload, [], ['super-admin'])

      const visibleTo = async (user: unknown) =>
        (
          await payload
            .find({
              collection: 'consent-logs',
              overrideAccess: false,
              user,
              where: { id: { equals: log.id } },
            })
            .catch(() => ({ docs: [] }))
        ).docs.length

      expect(await visibleTo(adminA)).toBe(1)
      expect(await visibleTo(superAdmin)).toBe(1)
      expect(await visibleTo(adminB)).toBe(0)
      expect(await visibleTo(viewerA)).toBe(0)
      expect(await visibleTo(null)).toBe(0)

      for (const user of [adminA, superAdmin]) {
        await expect(
          payload.update({
            collection: 'consent-logs',
            data: { marketing: true },
            id: log.id,
            overrideAccess: false,
            user,
          }),
        ).rejects.toThrow()
        await expect(
          payload.delete({ collection: 'consent-logs', id: log.id, overrideAccess: false, user }),
        ).rejects.toThrow()
        await expect(
          payload.create({
            collection: 'consent-logs',
            data: { ...record(tenantA), preferences: false, tenant: tenantA.id },
            overrideAccess: false,
            user,
          }),
        ).rejects.toThrow()
      }

      expect((await logsFor(body.consentId))[0].marketing).toBe(false)
    })

    it('lets a tenant admin edit their own banner settings but not another tenant’s', async () => {
      const tenant = await createTenant(payload)
      const admin = await createUser(payload, [{ roles: ['tenant-admin'], tenant: tenant.id }])

      const created = await payload.create({
        collection: 'consent-settings',
        data: { revision: 1, tenant: tenant.id },
        overrideAccess: false,
        user: admin,
      })
      expect(created.revision).toBe(1)

      await expect(
        payload.create({
          collection: 'consent-settings',
          data: { revision: 1, tenant: tenantB.id },
          overrideAccess: false,
          user: admin,
        }),
      ).rejects.toThrow()
    })
  })
})
