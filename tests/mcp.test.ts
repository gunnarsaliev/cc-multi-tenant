import type { Payload, PayloadRequest } from 'payload'

import { beforeAll, describe, expect, it } from 'vitest'

import type { Tenant } from '@/payload-types'

import { semanticSearchTool, translatePostTool } from '@/mcp/tools'

import { createTenant, createUser, getTestPayload, unique } from './helpers/payload'

const lexical = (value: string) =>
  ({
    root: {
      children: [
        {
          children: [{ detail: 0, format: 0, mode: 'normal', style: '', text: value, type: 'text', version: 1 }],
          direction: 'ltr',
          format: '',
          indent: 0,
          textFormat: 0,
          type: 'paragraph',
          version: 1,
        },
      ],
      direction: 'ltr',
      format: '',
      indent: 0,
      type: 'root',
      version: 1,
    },
  }) as never

describe('MCP', () => {
  let payload: Payload
  let tenantA: Tenant
  let tenantB: Tenant
  let draftB: { id: number }

  const req = (user: unknown) => ({ payload, user }) as unknown as PayloadRequest
  const parse = (result: { content: { text: string }[] }) => JSON.parse(result.content[0].text)
  const text = (result: { content: { text: string }[] }) => result.content[0].text

  const createPost = (tenant: Tenant, title: string, status: 'draft' | 'published' = 'published') =>
    payload.create({
      collection: 'blog',
      data: { _status: status, content: lexical(`${title} body`), slug: unique('slug'), tenant: tenant.id, title },
      draft: status === 'draft',
      locale: 'en',
    })

  beforeAll(async () => {
    payload = await getTestPayload()
    tenantA = await createTenant(payload)
    tenantB = await createTenant(payload)
    draftB = await createPost(tenantB, 'Private draft of tenant B', 'draft')
    await createPost(tenantA, 'Alpha gardens')
    await createPost(tenantB, 'Beta gardens')
    await payload.jobs.run({ limit: 100 })
  })

  describe('an API key used directly on the REST API', () => {
    /** With `useAPIKey`, the key document itself becomes `req.user`. */
    const asKey = async () => {
      const owner = await createUser(payload, [{ roles: ['tenant-viewer'], tenant: tenantA.id }])
      const key = await payload.create({
        collection: 'payload-mcp-api-keys' as never,
        data: { label: 'test', user: owner.id } as never,
      })
      return { ...(key as object), collection: 'payload-mcp-api-keys' } as never
    }

    it('cannot read other tenants’ posts or drafts', async () => {
      const { docs } = await payload.find({
        collection: 'blog',
        draft: true,
        limit: 100,
        overrideAccess: false,
        user: await asKey(),
      })

      expect(docs.map(({ id }) => id)).not.toContain(draftB.id)
      expect(docs.every(({ _status }) => _status === 'published')).toBe(true)
    })

    it.each(['tenants', 'users'] as const)('cannot list %s', async (collection) => {
      await expect(
        payload.find({ collection, overrideAccess: false, user: await asKey() }),
      ).rejects.toThrow(/not allowed/)
    })

    it('cannot update the user whose ID happens to match the key’s', async () => {
      const key = (await asKey()) as unknown as { id: number }
      const target = await payload.findByID({ collection: 'users', id: key.id })

      await expect(
        payload.update({
          collection: 'users',
          data: { username: 'hijacked' },
          id: target.id,
          overrideAccess: false,
          user: key as never,
        }),
      ).rejects.toBeDefined()
    })

    it('cannot create users', async () => {
      await expect(
        payload.create({
          collection: 'users',
          data: { email: `${unique('key')}@test.local`, password: 'test', roles: ['user'] },
          overrideAccess: false,
          user: (await asKey()) as never,
        }),
      ).rejects.toBeDefined()
    })

    it('cannot run the job queue', async () => {
      const allowed = await payload.config.jobs.access?.run?.({
        req: { headers: new Headers(), user: await asKey() } as never,
      })

      expect(allowed).toBe(false)
    })
  })

  describe('semanticSearch', () => {
    it('uses the caller’s tenant, and only that tenant', async () => {
      const user = await createUser(payload, [{ roles: ['tenant-viewer'], tenant: tenantA.id }])

      const results = parse(await semanticSearchTool.handler({ query: 'gardens' }, req(user)))

      expect(results.map(({ title }: { title: string }) => title)).toEqual(['Alpha gardens'])
    })

    it('refuses a tenant the caller does not belong to', async () => {
      const user = await createUser(payload, [{ roles: ['tenant-viewer'], tenant: tenantA.id }])

      const result = await semanticSearchTool.handler({ query: 'gardens', tenantId: tenantB.id }, req(user))

      expect(text(result)).toBe('Error: You do not have access to that tenant.')
    })

    it('asks which tenant when the caller has several, and allows choosing one', async () => {
      const user = await createUser(payload, [
        { roles: ['tenant-viewer'], tenant: tenantA.id },
        { roles: ['tenant-viewer'], tenant: tenantB.id },
      ])

      expect(text(await semanticSearchTool.handler({ query: 'gardens' }, req(user)))).toMatch(/Set tenantId/)

      const results = parse(await semanticSearchTool.handler({ query: 'gardens', tenantId: tenantB.id }, req(user)))
      expect(results.map(({ title }: { title: string }) => title)).toEqual(['Beta gardens'])
    })

    it('refuses a caller with no user, or an unknown locale', async () => {
      const user = await createUser(payload, [{ roles: ['tenant-viewer'], tenant: tenantA.id }])

      expect(text(await semanticSearchTool.handler({ query: 'x' }, req(null)))).toMatch(/needs a user/)
      expect(text(await semanticSearchTool.handler({ locale: 'xx', query: 'x' }, req(user)))).toMatch(/unknown locale/)
    })
  })

  describe('translatePost', () => {
    it('saves a draft for an admin of the tenant', async () => {
      const admin = await createUser(payload, [{ roles: ['tenant-admin'], tenant: tenantA.id }])
      const post = await createPost(tenantA, 'To translate', 'draft')

      await translatePostTool.handler({ id: post.id, targetLocale: 'bg' }, req(admin))

      const saved = await payload.findByID({ collection: 'blog', draft: true, fallbackLocale: false, id: post.id, locale: 'bg' })
      expect(saved.title).toBe('[Bulgarian] To translate')
      expect(saved._status).toBe('draft')
    })

    it('refuses a viewer and hides another tenant’s post', async () => {
      const viewer = await createUser(payload, [{ roles: ['tenant-viewer'], tenant: tenantA.id }])
      const admin = await createUser(payload, [{ roles: ['tenant-admin'], tenant: tenantA.id }])
      const own = await createPost(tenantA, 'Viewer target', 'draft')

      expect(text(await translatePostTool.handler({ id: own.id, targetLocale: 'bg' }, req(viewer)))).toMatch(/not allowed/)
      expect(text(await translatePostTool.handler({ id: draftB.id, targetLocale: 'bg' }, req(admin)))).toMatch(/not found/)
    })
  })
})
