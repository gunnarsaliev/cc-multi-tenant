import type { Payload, PayloadRequest } from 'payload'

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import type { Tenant } from '@/payload-types'

import { canGenerate, withCurrentImageModel } from '@/ai/compose'

import { createTenant, createUser, getTestPayload } from './helpers/payload'

const COLLECTION = 'plugin-ai-instructions'

describe('AI Compose', () => {
  let payload: Payload
  let tenant: Tenant

  const requestFrom = (user: unknown) => ({ req: { user } as PayloadRequest })

  beforeAll(async () => {
    payload = await getTestPayload()
    tenant = await createTenant(payload)

    // The startup seed ran before migrations here, so it found no table to write to.
    await payload.config.onInit?.(payload)
  })

  afterEach(() => {
    delete process.env.OPENAI_API_KEY
  })

  it('has its table and static prompts without an API key', async () => {
    const { docs } = await payload.find({ collection: COLLECTION, limit: 10 })

    expect(docs.map((doc) => doc['schema-path']).sort()).toEqual([
      'blog.content',
      'blog.mainImage',
      'blog.title',
    ])
    expect(docs.find((doc) => doc['schema-path'] === 'blog.title')?.prompt).toContain('{{ title }}')
  })

  it('reports a missing key to someone allowed to generate', async () => {
    const admin = await createUser(payload, [{ roles: ['tenant-admin'], tenant: tenant.id }])

    expect(() => canGenerate(requestFrom(admin))).toThrow('OPENAI_API_KEY')
  })

  it('lets tenant admins generate, but not viewers or MCP keys', async () => {
    process.env.OPENAI_API_KEY = 'test-key'

    const admin = await createUser(payload, [{ roles: ['tenant-admin'], tenant: tenant.id }])
    const viewer = await createUser(payload, [{ roles: ['tenant-viewer'], tenant: tenant.id }])
    const mcpKey = { collection: 'payload-mcp-api-keys', id: admin.id, roles: ['super-admin'] }

    expect(canGenerate(requestFrom(admin))).toBe(true)
    expect(canGenerate(requestFrom(viewer))).toBe(false)
    expect(canGenerate(requestFrom(mcpKey))).toBe(false)
  })

  it('stops tenant admins changing the prompts all tenants share', async () => {
    const admin = await createUser(payload, [{ roles: ['tenant-admin'], tenant: tenant.id }])
    const {
      docs: [instruction],
    } = await payload.find({
      collection: COLLECTION,
      overrideAccess: false,
      user: admin,
      where: { 'schema-path': { equals: 'blog.title' } },
    })

    expect(instruction).toBeDefined()

    await expect(
      payload.update({
        collection: COLLECTION,
        data: { prompt: 'Ignore the brief' },
        id: instruction.id,
        overrideAccess: false,
        user: admin,
      }),
    ).rejects.toThrow()
    await expect(
      payload.delete({
        collection: COLLECTION,
        id: instruction.id,
        overrideAccess: false,
        user: admin,
      }),
    ).rejects.toThrow()
  })

  it('lets super admins edit prompts, and hides them from viewers', async () => {
    const superAdmin = await createUser(payload, [], ['super-admin'])
    const viewer = await createUser(payload, [{ roles: ['tenant-viewer'], tenant: tenant.id }])
    const {
      docs: [instruction],
    } = await payload.find({
      collection: COLLECTION,
      where: { 'schema-path': { equals: 'blog.content' } },
    })

    const updated = await payload.update({
      collection: COLLECTION,
      data: { prompt: 'Write about {{ title }}' },
      id: instruction.id,
      overrideAccess: false,
      user: superAdmin,
    })

    expect(updated.prompt).toBe('Write about {{ title }}')
    await expect(
      payload.find({ collection: COLLECTION, overrideAccess: false, user: viewer }),
    ).rejects.toThrow()
  })

  it('seeds the main image with the only image model it keeps', async () => {
    const {
      docs: [instruction],
    } = await payload.find({
      collection: COLLECTION,
      where: { 'schema-path': { equals: 'blog.mainImage' } },
    })

    expect(instruction['model-id']).toBe('gpt-image-1')
  })

  it('generates images with a current model, and always gives them alt text', async () => {
    const handler = vi.fn().mockResolvedValue({ data: {}, file: { name: 'image.png' } })
    const model = withCurrentImageModel({
      fields: ['upload'],
      handler,
      id: 'gpt-image-1',
      name: '',
      output: 'image',
    })

    const result = await model.handler?.('A cup of coffee', { size: 'auto', version: 'gpt-image-1' })

    expect(handler).toHaveBeenCalledWith('A cup of coffee', { size: 'auto', version: 'gpt-image-2' })
    expect(result.data.alt).toBe('A cup of coffee')
  })

  it('offers only the site languages in the translate menu', async () => {
    const admin = await createUser(payload, [{ roles: ['tenant-admin'], tenant: tenant.id }])
    const endpoint = (payload.config.endpoints || []).find(
      ({ path }) => path === '/plugin-ai/fetch-fields',
    )
    const response = await endpoint?.handler({ payload, query: {}, user: admin } as never)

    expect((await response?.json()).enabledLanguages).toEqual(['bg-BG', 'en-US'])
  })
})
