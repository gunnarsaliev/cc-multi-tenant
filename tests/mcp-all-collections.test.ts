import type { MCPAccessSettings } from '@payloadcms/plugin-mcp'

import { describe, expect, it } from 'vitest'

import { expandAllCollections, withAllCollectionsField } from '@/mcp/allCollections'

const collections = {
  blog: { enabled: { create: true, find: true, update: true } },
  'blog-categories': { enabled: { create: true, find: true } },
  pages: { enabled: { find: true } },
  media: { enabled: true },
}

const key = (extra: Record<string, unknown>) =>
  ({ user: { id: 1 }, blog: { find: true, create: false, update: false }, ...extra }) as unknown as MCPAccessSettings

describe('MCP API keys: All collections', () => {
  it('leaves a key without the box ticked unchanged', () => {
    const settings = key({ allCollections: false })
    expect(expandAllCollections(settings, collections)).toBe(settings)
  })

  it('grants every operation the plugin exposes on every collection', () => {
    const expanded = expandAllCollections(key({ allCollections: true }), collections)

    expect(expanded.blog).toEqual({ create: true, find: true, update: true })
    expect(expanded.blogCategories).toEqual({ create: true, find: true })
    expect(expanded.pages).toEqual({ find: true })
    expect(expanded.media).toEqual({ create: true, delete: true, find: true, update: true })
  })

  it('does not grant operations the plugin does not expose', () => {
    const expanded = expandAllCollections(key({ allCollections: true }), collections)
    expect(expanded.pages).not.toHaveProperty('update')
    expect(expanded.blog).not.toHaveProperty('delete')
  })

  it('adds the checkbox and hides per-collection checkboxes while it is ticked', () => {
    const permissions = (name: string) => ({
      type: 'collapsible' as const,
      label: name,
      fields: [{ name, type: 'group' as const, fields: [] }],
    })
    const result = withAllCollectionsField(collections)({
      slug: 'payload-mcp-api-keys',
      fields: [
        { name: 'label', type: 'text' },
        permissions('blog'),
        permissions('pages'),
        permissions('payload-mcp-tool'),
      ],
    })

    const names = result.fields.map((f) => ('name' in f ? f.name : (f as { label: string }).label))
    expect(names).toEqual(['label', 'allCollections', 'blog', 'pages', 'payload-mcp-tool'])

    const blog = result.fields[2] as { admin: { condition: (data: unknown) => boolean } }
    expect(blog.admin.condition({ allCollections: true })).toBe(false)
    expect(blog.admin.condition({ allCollections: false })).toBe(true)
    expect((result.fields[4] as { admin?: unknown }).admin).toBeUndefined()
  })
})
