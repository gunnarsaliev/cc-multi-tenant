import type { Payload } from 'payload'

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Tenant } from '@/payload-types'

import { chunkContent, chunkFAQ } from '@/search/chunkContent'
import { getDatabase } from '@/search/db'
import { searchEndpoint } from '@/search/endpoint'
import { indexAllDocuments, indexDocument } from '@/search/indexDocument'
import { searchContent } from '@/search/searchContent'
import { sql } from '@payloadcms/db-postgres/drizzle'

import { createTenant, createUser, getTestPayload, unique } from './helpers/payload'

const embedMany = vi.hoisted(() => ({ calls: 0 }))

vi.mock('ai', async (original) => {
  const actual = await original<typeof import('ai')>()
  return {
    ...actual,
    embedMany: (args: Parameters<typeof actual.embedMany>[0]) => {
      embedMany.calls += args.values.length
      return actual.embedMany(args)
    },
  }
})

const paragraph = (value: string) => ({
  children: [{ detail: 0, format: 0, mode: 'normal', style: '', text: value, type: 'text', version: 1 }],
  direction: 'ltr',
  format: '',
  indent: 0,
  textFormat: 0,
  type: 'paragraph',
  version: 1,
})

const heading = (value: string) => ({ ...paragraph(value), tag: 'h2', type: 'heading' })

const lexical = (...children: unknown[]) =>
  ({
    root: { children, direction: 'ltr', format: '', indent: 0, type: 'root', version: 1 },
  }) as never

describe('chunking', () => {
  it('groups text under its heading', () => {
    const chunks = chunkContent(
      'Title',
      lexical(paragraph('Intro.'), heading('Setup'), paragraph('Install it.'), paragraph('Run it.')),
    )

    expect(chunks).toEqual([
      { content: 'Intro.', heading: null },
      { content: 'Install it.\n\nRun it.', heading: 'Setup' },
    ])
  })

  it('splits long text with overlap and no piece over the limit', () => {
    const sentence = 'This is one sentence about gardens. '
    const chunks = chunkContent('Title', lexical(paragraph(sentence.repeat(200))))

    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.every(({ content }) => content.length <= 1_800)).toBe(true)
    expect(chunks.map(({ content }) => content).join('').length).toBeGreaterThan(sentence.length * 199)
    expect(chunks[0].content).toContain(chunks[1].content.slice(0, 100))
  })

  it('keeps a title-only post findable, and returns nothing with no text at all', () => {
    expect(chunkContent('Only a title', lexical(paragraph('')))).toEqual([
      { content: 'Only a title', heading: null },
    ])
    expect(chunkContent(null, null)).toEqual([])
  })
})

describe('chunking an FAQ', () => {
  it('makes one chunk per answer, headed by its question', () => {
    expect(
      chunkFAQ([
        { answer: lexical(paragraph('Daily in summer.')), question: 'How often to water?' },
        { answer: lexical(paragraph('')), question: 'Any pests?' },
        { answer: null, question: '' },
      ]),
    ).toEqual([
      { content: 'Daily in summer.', heading: 'How often to water?' },
      { content: 'Any pests?', heading: 'Any pests?' },
    ])
    expect(chunkFAQ(null)).toEqual([])
  })
})

describe('semantic search', () => {
  let payload: Payload
  let tenantA: Tenant
  let tenantB: Tenant

  const createPost = async (
    tenant: Tenant,
    title: string,
    body: string,
    { locale = 'en', status = 'published' }: { locale?: 'bg' | 'en'; status?: 'draft' | 'published' } = {},
  ) =>
    payload.create({
      collection: 'blog',
      data: {
        _status: status,
        content: lexical(paragraph(body)),
        slug: unique('slug'),
        tenant: tenant.id,
        title,
      },
      draft: status === 'draft',
      locale,
    })

  const runJobs = () => payload.jobs.run({ limit: 100 })

  const search = (tenant: Tenant, query: string, locale = 'en') =>
    searchContent({ locale, payload, query, tenantId: tenant.id })

  const chunkCount = async (id: number, locale?: string) => {
    const { rows } = await getDatabase(payload).execute(
      sql`SELECT count(*)::int AS count FROM content_chunks WHERE doc_id = ${id} AND collection = 'blog'
          AND (${locale ?? null}::text IS NULL OR locale = ${locale ?? null})`,
    )
    return (rows[0] as { count: number }).count
  }

  beforeAll(async () => {
    payload = await getTestPayload()
  })

  beforeEach(async () => {
    await getDatabase(payload).execute(sql`DELETE FROM content_chunks`)
    await runJobs()
    tenantA = await createTenant(payload)
    tenantB = await createTenant(payload)
    embedMany.calls = 0
  })

  it('finds published content through the job queue, not during the save', async () => {
    const post = await createPost(tenantA, 'Growing tomatoes', 'Tomatoes need sun and water daily.')

    expect(await chunkCount(post.id)).toBe(0)
    await runJobs()

    const [hit] = await search(tenantA, 'tomatoes sun water')
    expect(hit).toMatchObject({ collection: 'blog', docID: post.id, slug: post.slug, title: 'Growing tomatoes' })
  })

  it('never returns another tenant’s content, even for an exact match', async () => {
    await createPost(tenantB, 'Secret roadmap', 'The secret roadmap for tenant B.')
    await runJobs()

    expect(await search(tenantA, 'secret roadmap tenant')).toEqual([])
  })

  it('still finds a tenant’s rows when most of the index belongs to others', async () => {
    for (let index = 0; index < 60; index++) {
      await createPost(tenantB, `Other ${index}`, `Gardens and tomatoes number ${index}.`)
    }

    const small = await createPost(tenantA, 'Gardens', 'Gardens and tomatoes.')
    await runJobs()

    expect((await search(tenantA, 'gardens and tomatoes')).map(({ docID }) => docID)).toEqual([small.id])
  })

  it('keeps drafts out, and removes content when it is unpublished or deleted', async () => {
    const draft = await createPost(tenantA, 'Draft idea', 'Unreleased draft idea.', { status: 'draft' })
    const published = await createPost(tenantA, 'Live post', 'A live published post.')
    await runJobs()

    expect(await chunkCount(draft.id)).toBe(0)
    expect(await chunkCount(published.id)).toBeGreaterThan(0)

    await payload.update({ collection: 'blog', data: { _status: 'draft' }, id: published.id })
    await runJobs()
    expect(await chunkCount(published.id)).toBe(0)

    await payload.update({ collection: 'blog', data: { _status: 'published' }, id: published.id })
    await runJobs()
    expect(await chunkCount(published.id)).toBeGreaterThan(0)

    await payload.delete({ collection: 'blog', id: published.id })
    await runJobs()
    expect(await chunkCount(published.id)).toBe(0)
  })

  it('ignores a new draft of a published post until it is published', async () => {
    const post = await createPost(tenantA, 'Original title', 'Original body text.')
    await runJobs()

    await payload.update({
      collection: 'blog',
      data: { content: lexical(paragraph('Unreleased changes.')) },
      draft: true,
      id: post.id,
    })
    await runJobs()

    expect(await search(tenantA, 'unreleased changes')).toEqual([])
    expect((await search(tenantA, 'original body text'))[0].docID).toBe(post.id)
  })

  it('stores each locale separately, without fallback to another language', async () => {
    const post = await createPost(tenantA, 'Hello world', 'English only body.')
    await runJobs()

    expect(await chunkCount(post.id, 'en')).toBeGreaterThan(0)
    expect(await chunkCount(post.id, 'bg')).toBe(0)

    await payload.update({
      collection: 'blog',
      data: { content: lexical(paragraph('Български текст за градини.')), title: 'Здравей' },
      id: post.id,
      locale: 'bg',
    })
    await runJobs()

    expect((await search(tenantA, 'градини текст', 'bg'))[0].docID).toBe(post.id)
    expect(await search(tenantA, 'градини текст', 'en')).toEqual([])
  })

  it('indexes FAQ answers under their questions, in their own locale', async () => {
    const post = await createPost(tenantA, 'Tomato care', 'General notes.')
    await payload.update({
      collection: 'blog',
      data: {
        faq: [{ answer: lexical(paragraph('Pinch suckers weekly for bigger fruit.')), question: 'How do I prune tomatoes?' }],
      },
      id: post.id,
      locale: 'en',
    })
    await runJobs()

    const { rows } = await getDatabase(payload).execute(
      sql`SELECT heading, content FROM content_chunks WHERE doc_id = ${post.id} AND collection = 'blog' AND locale = 'en'`,
    )
    expect(rows).toContainEqual({
      content: 'Pinch suckers weekly for bigger fruit.',
      heading: 'How do I prune tomatoes?',
    })
    expect(await chunkCount(post.id, 'bg')).toBe(0)
  })

  it('does not call the embedding model again when nothing changed', async () => {
    const post = await createPost(tenantA, 'Stable post', 'Stable body.')
    await runJobs()
    expect(embedMany.calls).toBe(1)

    await payload.update({ collection: 'blog', data: { _status: 'published' }, id: post.id })
    await runJobs()
    expect(embedMany.calls).toBe(1)
  })

  it('embeds only the changed chunk and removes leftovers', async () => {
    const post = await payload.create({
      collection: 'blog',
      data: {
        _status: 'published',
        content: lexical(heading('One'), paragraph('First part.'), heading('Two'), paragraph('Second part.')),
        slug: unique('slug'),
        tenant: tenantA.id,
        title: 'Parts',
      },
    })
    await runJobs()
    expect(await chunkCount(post.id)).toBe(2)
    embedMany.calls = 0

    await payload.update({
      collection: 'blog',
      data: { content: lexical(heading('One'), paragraph('First part changed.')) },
      id: post.id,
    })
    await runJobs()

    expect(embedMany.calls).toBe(1)
    expect(await chunkCount(post.id)).toBe(1)
  })

  it('finds exact terms through full-text search when the vector side has no match', async () => {
    const post = await createPost(tenantA, 'Release notes', `Mentions the codename zephyr among ${'many other assorted unrelated words here '.repeat(8)}`)
    await runJobs()

    expect((await search(tenantA, 'zephyr'))[0].docID).toBe(post.id)
  })

  it('returns nothing for a query with no relation to the content', async () => {
    await createPost(tenantA, 'Tomatoes', 'Tomatoes need sun.')
    await runJobs()

    expect(await search(tenantA, 'quantum chromodynamics')).toEqual([])
  })

  it('returns one result per document', async () => {
    const post = await payload.create({
      collection: 'blog',
      data: {
        _status: 'published',
        content: lexical(heading('A'), paragraph('Gardens gardens.'), heading('B'), paragraph('Gardens again.')),
        slug: unique('slug'),
        tenant: tenantA.id,
        title: 'Gardens',
      },
    })
    await runJobs()

    expect((await search(tenantA, 'gardens')).map(({ docID }) => docID)).toEqual([post.id])
  })

  it('leaves search content alone and queues nothing to retry without an embedding model', async () => {
    const post = await createPost(tenantA, 'Later', 'Indexed later.')
    const previous = process.env.AI_MOCK
    process.env.AI_MOCK = 'false'

    try {
      expect(await indexDocument({ collection: 'blog', id: post.id, payload })).toBe('not-configured')
      expect(await chunkCount(post.id)).toBe(0)
    } finally {
      process.env.AI_MOCK = previous
    }

    const totals = await indexAllDocuments(payload)
    expect(totals.indexed).toBeGreaterThan(0)
    expect(await chunkCount(post.id)).toBeGreaterThan(0)
  })

  it('indexes pages, which have no draft status', async () => {
    const page = await payload.create({
      collection: 'pages',
      data: { slug: unique('page'), tenant: tenantA.id, title: 'Contact the gardeners' },
      locale: 'en',
    })
    await runJobs()

    expect((await search(tenantA, 'contact gardeners'))[0]).toMatchObject({ collection: 'pages', docID: page.id })
  })

  describe('endpoint', () => {
    const call = (params: Record<string, string>, user: unknown = null) =>
      (searchEndpoint.handler as (req: never) => Promise<Response>)({
        payload,
        url: `http://test/api/search?${new URLSearchParams(params)}`,
        user,
      } as never)

    const createPrivateTenant = async () => {
      const name = unique('private')
      return payload.create({
        collection: 'tenants',
        data: { allowPublicRead: false, domain: `${name}.test`, name, slug: name },
      })
    }

    it('lets visitors search a public tenant, in the requested locale', async () => {
      const post = await createPost(tenantA, 'Public tomatoes', 'Public tomatoes post.')
      await runJobs()

      const response = await call({ q: 'public tomatoes', tenant: tenantA.slug })

      expect(response.status).toBe(200)
      expect((await response.json()).results[0].docID).toBe(post.id)
    })

    it('hides a private tenant from visitors and outsiders, but not its members', async () => {
      const tenant = await createPrivateTenant()
      await createPost(tenant, 'Private tomatoes', 'Private tomatoes post.')
      await runJobs()
      const member = await createUser(payload, [{ roles: ['tenant-viewer'], tenant: tenant.id }])
      const outsider = await createUser(payload, [{ roles: ['tenant-admin'], tenant: tenantA.id }])

      expect((await call({ q: 'tomatoes', tenant: tenant.slug })).status).toBe(404)
      expect((await call({ q: 'tomatoes', tenant: tenant.slug }, outsider)).status).toBe(404)
      expect((await call({ q: 'tomatoes', tenant: tenant.slug }, member)).status).toBe(200)
    })

    it('treats an unknown tenant the same as a private one', async () => {
      expect((await call({ q: 'x', tenant: 'nope' })).status).toBe(404)
    })

    it('rejects bad input', async () => {
      expect((await call({ q: '', tenant: tenantA.slug })).status).toBe(400)
      expect((await call({ q: 'x'.repeat(501), tenant: tenantA.slug })).status).toBe(400)
      expect((await call({ tenant: tenantA.slug })).status).toBe(400)
      expect((await call({ locale: 'xx', q: 'x', tenant: tenantA.slug })).status).toBe(400)
    })

    it('reports 503 without an embedding model', async () => {
      const previous = process.env.AI_MOCK
      process.env.AI_MOCK = 'false'

      try {
        expect((await call({ q: 'x', tenant: tenantA.slug })).status).toBe(503)
      } finally {
        process.env.AI_MOCK = previous
      }
    })
  })

  it('treats SQL in a query as plain text', async () => {
    await createPost(tenantA, 'Safe', 'Safe content.')
    await runJobs()

    await expect(search(tenantA, `'; DROP TABLE content_chunks; --`)).resolves.toBeDefined()
    expect(await chunkCount(0)).toBe(0)
  })
})
