import type { Payload } from 'payload'

import { createLocalReq, createPayloadRequest } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import type { Tenant } from '@/payload-types'

import { createTenant, createUser, getTestPayload, unique } from './helpers/payload'

type TestUser = Awaited<ReturnType<typeof createUser>>

describe('import and export', () => {
  let payload: Payload
  let tenantA: Tenant
  let tenantB: Tenant
  let adminA: TestUser
  let adminB: TestUser
  let viewerA: TestUser
  let titleA: string
  let titleB: string

  const download = async (user: TestUser, format: 'csv' | 'json', collectionSlug = 'blog') => {
    const endpoint = payload.collections.exports.config.endpoints
    const handler = (endpoint || []).find(({ path }) => path === '/download')!.handler
    const req = await createLocalReq({ user }, payload)

    const res = await handler(
      Object.assign(req, {
        json: async () => ({
          data: { name: 'export', collectionSlug, drafts: 'yes', format, locale: 'en' },
        }),
      }),
    )

    return { body: await res.text(), status: res.status }
  }

  const importFile = (
    user: TestUser,
    name: string,
    mimetype: string,
    content: string,
    collectionSlug = 'blog',
  ) => {
    const data = Buffer.from(content)

    return payload.create({
      collection: 'imports',
      data: { collectionSlug, importMode: 'create' },
      file: { name, data, mimetype, size: data.length },
      overrideAccess: false,
      user,
    })
  }

  const postsTitled = async (title: string) =>
    (
      await payload.find({
        collection: 'blog',
        depth: 0,
        draft: true,
        locale: 'en',
        where: { title: { equals: title } },
      })
    ).docs

  beforeAll(async () => {
    payload = await getTestPayload()
    tenantA = await createTenant(payload)
    tenantB = await createTenant(payload)
    adminA = await createUser(payload, [{ roles: ['tenant-admin'], tenant: tenantA.id }])
    adminB = await createUser(payload, [{ roles: ['tenant-admin'], tenant: tenantB.id }])
    viewerA = await createUser(payload, [{ roles: ['tenant-viewer'], tenant: tenantA.id }])
    titleA = unique('export-a')
    titleB = unique('export-b')

    for (const [tenant, title] of [
      [tenantA, titleA],
      [tenantB, titleB],
    ] as const) {
      await payload.create({
        collection: 'blog',
        data: { slug: title, tenant: tenant.id, title },
        draft: true,
        locale: 'en',
      })
    }
  })

  it.each(['csv', 'json'] as const)('exports only the tenant admin’s own posts as %s', async (format) => {
    const { body, status } = await download(adminA, format)

    expect(status).toBe(200)
    expect(body).toContain(titleA)
    expect(body).not.toContain(titleB)

    if (format === 'json') {
      expect(Array.isArray(JSON.parse(body))).toBe(true)
    }
  })

  it('imports a CSV as drafts in the importer’s tenant', async () => {
    const title = unique('import-csv')
    const result = await importFile(
      adminA,
      `${title}.csv`,
      'text/csv',
      `title,slug,tenant\n${title},${title},${tenantA.id}\n`,
    )

    expect(result.status).toBe('completed')

    const [post] = await postsTitled(title)

    expect(post.tenant).toBe(tenantA.id)
    expect(post._status).toBe('draft')
  })

  it('imports JSON', async () => {
    const title = unique('import-json')
    const result = await importFile(
      adminA,
      `${title}.json`,
      'application/json',
      JSON.stringify([{ slug: title, tenant: tenantA.id, title }]),
    )

    expect(result.status).toBe('completed')
    expect(await postsTitled(title)).toHaveLength(1)
  })

  it('imports nothing into a tenant the importer does not administer', async () => {
    const title = unique('import-foreign')
    const result = await importFile(
      adminA,
      `${title}.csv`,
      'text/csv',
      `title,slug,tenant\n${title},${title},${tenantB.id}\n`,
    )

    expect(result.status).toBe('failed')
    expect(await postsTitled(title)).toHaveLength(0)
  })

  it('does not let tenant viewers import', async () => {
    const title = unique('import-viewer')

    await expect(
      importFile(viewerA, `${title}.csv`, 'text/csv', `title,slug\n${title},${title}\n`),
    ).rejects.toThrow()
    expect(await postsTitled(title)).toHaveLength(0)
  })

  it.each(['blog-categories', 'consent-logs', 'consent-settings', 'media', 'pages', 'tenants'])(
    'exports %s',
    async (slug) => {
      expect((await download(adminA, 'csv', slug)).status).toBe(200)
    },
  )

  it('refuses to export collections that are not listed', async () => {
    expect((await download(adminA, 'json', 'payload-mcp-api-keys')).status).toBe(400)
    expect((await download(adminA, 'json', 'payload-jobs')).status).toBe(400)
  })

  it('checks the collection on a real HTTP body and still hands it to the plugin', async () => {
    const send = async (collectionSlug: string, endpointPath: string) => {
      const endpoint = payload.collections.exports.config.endpoints || []
      const { handler } = endpoint.find(({ path }) => path === endpointPath)!
      const req = await createPayloadRequest({
        config: payload.config,
        request: new Request('http://localhost/api/exports' + endpointPath, {
          body: JSON.stringify({
            data: { name: 'export', collectionSlug, drafts: 'yes', format: 'json', locale: 'en' },
          }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        }),
      })
      req.user = adminA

      const res = await handler(req)

      return { body: await res.text(), status: res.status }
    }

    const ok = await send('blog', '/download')
    expect(ok.status).toBe(200)
    expect(ok.body).toContain(titleA)
    expect((await send('payload-jobs', '/download')).status).toBe(400)
  })

  it('does not let tenant viewers download exports', async () => {
    expect((await download(viewerA, 'csv')).status).toBe(403)
  })

  it.each(['media', 'consent-logs', 'payload-mcp-api-keys'])(
    'refuses imports into %s',
    async (slug) => {
      await expect(
        importFile(adminA, 'rows.json', 'application/json', '[{"alt":"x"}]', slug),
      ).rejects.toThrow('cannot be used here')
    },
  )

  it('exports users without password hashes', async () => {
    const { body, status } = await download(adminA, 'json', 'users')

    expect(status).toBe(200)
    expect(body).toContain(adminA.email)
    expect(body).not.toContain(adminB.email)
    expect(body).not.toMatch(/"(hash|salt|password)"/)
  })

  it('does not let tenant admins import users', async () => {
    const email = `${unique('import-user')}@test.local`
    const result = await importFile(
      adminA,
      'users.json',
      'application/json',
      JSON.stringify([{ email, password: 'x', roles: ['super-admin'] }]),
      'users',
    )

    expect(result.status).toBe('failed')
    expect(
      (await payload.find({ collection: 'users', where: { email: { equals: email } } })).totalDocs,
    ).toBe(0)
  })

  it('lets super admins import users', async () => {
    const superAdmin = await createUser(payload, [], ['super-admin'])
    const email = `${unique('import-user')}@test.local`
    const result = await importFile(
      superAdmin,
      'users.csv',
      'text/csv',
      `email,password,tenants_0_tenant,tenants_0_roles_0\n${email},secret,${tenantA.id},tenant-viewer\n`,
      'users',
    )

    expect(result.status).toBe('completed')
    expect(
      (await payload.find({ collection: 'users', where: { email: { equals: email } } })).totalDocs,
    ).toBe(1)
  })

  it('shows an import only to the user who ran it', async () => {
    const title = unique('import-private')
    const { id } = await importFile(
      adminA,
      `${title}.csv`,
      'text/csv',
      `title,slug,tenant\n${title},${title},${tenantA.id}\n`,
    )

    const visibleTo = async (user: TestUser) =>
      (
        await payload.find({
          collection: 'imports',
          overrideAccess: false,
          user,
          where: { id: { equals: id } },
        })
      ).totalDocs

    expect(await visibleTo(adminA)).toBe(1)
    expect(await visibleTo(adminB)).toBe(0)
  })

  // The file is not stored, so a URL would make the admin fetch a missing file and get a 500.
  it('gives a finished import no file URL', async () => {
    const title = unique('import-url')
    const { id } = await importFile(
      adminA,
      `${title}.csv`,
      'text/csv',
      `title,slug,tenant\n${title},${title},${tenantA.id}\n`,
    )

    const doc = await payload.findByID({ collection: 'imports', id })

    expect(doc.filename).toBe(`${title}.csv`)
    expect(doc.url).toBeNull()
  })
})
