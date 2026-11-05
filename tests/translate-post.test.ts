import type { Payload } from 'payload'

import { MockLanguageModelV4 } from 'ai/test'
import { beforeAll, describe, expect, it } from 'vitest'

import type { Tenant } from '@/payload-types'

import { translateEndpoint, translationStatusEndpoint } from '@/collections/Blog/endpoints/translate'
import { getTranslationStatus, translatePost } from '@/translation/translatePost'

import { asUser, createTenant, createUser, getTestPayload, unique } from './helpers/payload'

const lexical = (value: string) =>
  ({
    root: {
      children: [
        {
          children: [
            { detail: 0, format: 0, mode: 'normal', style: '', text: value, type: 'text', version: 1 },
          ],
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

const usage = {
  inputTokens: { cacheRead: undefined, cacheWrite: undefined, noCache: 0, total: 0 },
  outputTokens: { reasoning: undefined, text: 0, total: 0 },
}

const modelReturning = (text: string) =>
  new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ text, type: 'text' }],
      finishReason: { raw: undefined, unified: 'stop' },
      usage,
      warnings: [],
    }),
  })

describe('translating a post', () => {
  let payload: Payload
  let tenant: Tenant
  let otherTenant: Tenant
  let admin: Awaited<ReturnType<typeof createUser>>

  const createPost = async (locale: 'bg' | 'en', status: 'draft' | 'published' = 'draft') =>
    payload.create({
      collection: 'blog',
      data: {
        _status: status,
        content: lexical(`Body in ${locale}`),
        slug: unique('slug'),
        tenant: tenant.id,
        title: `Title in ${locale}`,
      },
      draft: status === 'draft',
      locale,
    })

  const readLocale = (id: number, locale: 'bg' | 'en', draft = true) =>
    payload.findByID({ collection: 'blog', draft, fallbackLocale: false, id, locale })

  const bodyText = (doc: { content?: unknown }) =>
    (doc.content as { root: { children: { children: { text: string }[] }[] } } | null | undefined)
      ?.root.children[0].children[0].text

  beforeAll(async () => {
    payload = await getTestPayload()
    tenant = await createTenant(payload)
    otherTenant = await createTenant(payload)
    admin = await createUser(payload, [{ roles: ['tenant-admin'], tenant: tenant.id }])
  })

  it('translates English into Bulgarian as a draft', async () => {
    const post = await createPost('en')

    const result = await translatePost({ id: post.id, payload, targetLocale: 'bg', user: admin })

    expect(result).toEqual({ sourceLocale: 'en', targetLocale: 'bg' })
    const bg = await readLocale(post.id, 'bg')
    expect(bg.title).toBe('[Bulgarian] Title in en')
    expect(bodyText(bg)).toBe('[Bulgarian] Body in en')
    expect(bg._status).toBe('draft')
  })

  it('uses whichever version exists when English is missing', async () => {
    const post = await createPost('bg')

    const result = await translatePost({ id: post.id, payload, targetLocale: 'en', user: admin })

    expect(result.sourceLocale).toBe('bg')
    expect((await readLocale(post.id, 'en')).title).toBe('[English] Title in bg')
  })

  it('leaves the source locale and non-localized fields alone', async () => {
    const post = await createPost('en')

    await translatePost({ id: post.id, payload, targetLocale: 'bg', user: admin })

    const en = await readLocale(post.id, 'en')
    expect(en.title).toBe('Title in en')
    expect(bodyText(en)).toBe('Body in en')
    expect(en.slug).toBe(post.slug)
  })

  it('does not change what visitors see on a published post', async () => {
    const post = await createPost('en', 'published')

    await translatePost({ id: post.id, payload, targetLocale: 'bg', user: admin })

    const published = await payload.findByID({
      collection: 'blog',
      fallbackLocale: false,
      id: post.id,
      locale: 'bg',
      overrideAccess: false,
    })
    expect(published.title ?? null).toBeNull()
    expect((await readLocale(post.id, 'en', false)).title).toBe('Title in en')
  })

  it('translates the latest draft, not the published version', async () => {
    const post = await createPost('en', 'published')
    await payload.update({
      collection: 'blog',
      data: { title: 'Newer draft title' },
      draft: true,
      id: post.id,
      locale: 'en',
    })

    await translatePost({ id: post.id, payload, targetLocale: 'bg', user: admin })

    expect((await readLocale(post.id, 'bg')).title).toBe('[Bulgarian] Newer draft title')
  })

  it('refuses to overwrite without confirmation, then overwrites with it', async () => {
    const post = await createPost('en')
    await translatePost({ id: post.id, payload, targetLocale: 'bg', user: admin })
    await payload.update({
      collection: 'blog',
      data: { title: 'Edited by hand' },
      draft: true,
      id: post.id,
      locale: 'bg',
    })

    await expect(
      translatePost({ id: post.id, payload, targetLocale: 'bg', user: admin }),
    ).rejects.toMatchObject({ status: 409 })
    expect((await readLocale(post.id, 'bg')).title).toBe('Edited by hand')

    await translatePost({ id: post.id, overwrite: true, payload, targetLocale: 'bg', user: admin })
    expect((await readLocale(post.id, 'bg')).title).toBe('[Bulgarian] Title in en')
  })

  it('is not fooled by fallback into thinking an empty locale has content', async () => {
    const post = await createPost('en')

    const status = await getTranslationStatus({ id: post.id, payload, user: admin })

    expect(status.localesWithContent).toEqual(['en'])
  })

  it('rejects translating a locale into itself, or from an empty locale', async () => {
    const post = await createPost('en')

    await expect(
      translatePost({ id: post.id, overwrite: true, payload, sourceLocale: 'en', targetLocale: 'en', user: admin }),
    ).rejects.toMatchObject({ status: 422 })
    await expect(
      translatePost({ id: post.id, payload, sourceLocale: 'bg', targetLocale: 'en', overwrite: true, user: admin }),
    ).rejects.toMatchObject({ status: 422 })
  })

  it('saves nothing when the model returns damaged output, even after a retry', async () => {
    const post = await createPost('en')
    const model = modelReturning(JSON.stringify({ segments: [{ id: 'title', text: 'Only title' }] }))

    await expect(
      translatePost({ id: post.id, model, payload, targetLocale: 'bg', user: admin }),
    ).rejects.toMatchObject({ status: 502 })

    expect(model.doGenerateCalls).toHaveLength(2)
    expect((await readLocale(post.id, 'bg')).title ?? null).toBeNull()
  })

  it('saves nothing when the model returns invalid JSON', async () => {
    const post = await createPost('en')

    await expect(
      translatePost({ id: post.id, model: modelReturning('not json'), payload, targetLocale: 'bg', user: admin }),
    ).rejects.toMatchObject({ status: 502 })

    expect((await readLocale(post.id, 'bg')).title ?? null).toBeNull()
  })

  describe('access', () => {
    it('refuses a viewer in the same tenant before calling the model', async () => {
      const post = await createPost('en')
      const viewer = await createUser(payload, [{ roles: ['tenant-viewer'], tenant: tenant.id }])
      const model = modelReturning('{}')

      await expect(
        translatePost({ id: post.id, model, payload, targetLocale: 'bg', user: viewer }),
      ).rejects.toMatchObject({ status: 403 })
      expect(model.doGenerateCalls).toHaveLength(0)
    })

    it('refuses an admin of another tenant', async () => {
      const post = await createPost('en')
      const outsider = await createUser(payload, [{ roles: ['tenant-admin'], tenant: otherTenant.id }])

      await expect(
        translatePost({ id: post.id, payload, targetLocale: 'bg', user: outsider }),
      ).rejects.toBeDefined()
      expect((await readLocale(post.id, 'bg')).title ?? null).toBeNull()
    })
  })

  describe('endpoint', () => {
    const call = (
      endpoint: typeof translateEndpoint,
      id: number,
      user: unknown,
      body?: unknown,
    ) =>
      (endpoint.handler as (req: never) => Promise<Response>)({
        json: async () => body,
        payload,
        routeParams: { id: String(id) },
        user,
      } as never)

    it('returns 401 when logged out', async () => {
      const post = await createPost('en')
      const response = await call(translateEndpoint, post.id, null, { targetLocale: 'bg' })
      expect(response.status).toBe(401)
    })

    it('returns 400 for a bad body and for an unknown locale', async () => {
      const post = await createPost('en')
      expect((await call(translateEndpoint, post.id, admin, {})).status).toBe(400)
      expect((await call(translateEndpoint, post.id, admin, { targetLocale: 'xx' })).status).toBe(400)
    })

    it('hides posts in other tenants as 404, for status and for translating', async () => {
      const post = await createPost('en')
      const outsider = await createUser(payload, [{ roles: ['tenant-admin'], tenant: otherTenant.id }])

      expect((await call(translationStatusEndpoint, post.id, outsider)).status).toBe(404)
      expect((await call(translateEndpoint, post.id, outsider, { targetLocale: 'bg' })).status).toBe(404)
    })

    it('translates when the request is valid', async () => {
      const post = await createPost('en')
      const response = await call(translateEndpoint, post.id, asUser(admin), { targetLocale: 'bg' })

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ sourceLocale: 'en', targetLocale: 'bg' })
    })
  })

  it('returns 503 when AI is not configured', async () => {
    const post = await createPost('en')
    const previous = process.env.AI_MOCK
    process.env.AI_MOCK = 'false'

    try {
      await expect(
        translatePost({ id: post.id, payload, targetLocale: 'bg', user: admin }),
      ).rejects.toMatchObject({ status: 503 })
    } finally {
      process.env.AI_MOCK = previous
    }
  })
})
