import { afterEach, describe, expect, it, vi } from 'vitest'

import { decideApproval, tenantKeyAuth } from '../agent/lib/payload-mcp'
import { payloadSession } from '../agent/lib/payload-session'

const signIn = (user: unknown, cookie = 'payload-token=abc') => {
  const fetchMock = vi.fn(async () => Response.json({ user }))
  vi.stubGlobal('fetch', fetchMock)
  return {
    fetchMock,
    run: () =>
      (payloadSession as (request: Request) => Promise<unknown>)(
        new Request('http://test/eve/v1/sessions', { headers: { cookie } }),
      ),
  }
}

const viewerOf1 = { collection: 'users', id: 7, tenants: [{ roles: ['tenant-viewer'], tenant: 1 }] }
const adminOf1 = { collection: 'users', id: 8, tenants: [{ roles: ['tenant-admin'], tenant: { id: 1 } }] }

afterEach(() => vi.unstubAllGlobals())

describe('agent session auth', () => {
  it('pins a user to their only tenant', async () => {
    await expect(signIn(viewerOf1).run()).resolves.toMatchObject({
      attributes: { canEdit: 'false', tenantId: '1' },
      principalId: '7',
      principalType: 'user',
    })
  })

  it('marks tenant admins as able to edit', async () => {
    await expect(signIn(adminOf1).run()).resolves.toMatchObject({ attributes: { canEdit: 'true' } })
  })

  it('refuses a tenant cookie for a tenant the user is not in', async () => {
    await expect(signIn(viewerOf1, 'payload-token=abc; payload-tenant=2').run()).resolves.toBeNull()
  })

  it('needs a selection when the user has several tenants', async () => {
    const user = {
      collection: 'users',
      id: 9,
      tenants: [
        { roles: ['tenant-viewer'], tenant: 1 },
        { roles: ['tenant-admin'], tenant: 2 },
      ],
    }

    await expect(signIn(user).run()).resolves.toBeNull()
    await expect(signIn(user, 'payload-tenant=2; payload-token=abc').run()).resolves.toMatchObject({
      attributes: { canEdit: 'true', tenantId: '2' },
    })
  })

  it('lets a super-admin work in the selected tenant only', async () => {
    const user = { collection: 'users', id: 1, roles: ['super-admin'], tenants: [] }

    await expect(signIn(user).run()).resolves.toBeNull()
    await expect(signIn(user, 'payload-token=a; payload-tenant=5').run()).resolves.toMatchObject({
      attributes: { canEdit: 'true', tenantId: '5' },
    })
  })

  it('refuses logged-out requests, API keys and junk tenant cookies', async () => {
    await expect(signIn(null).run()).resolves.toBeNull()
    await expect(
      signIn({ collection: 'payload-mcp-api-keys', id: 1, tenants: [] }).run(),
    ).resolves.toBeNull()
    await expect(signIn(viewerOf1, 'payload-tenant=1%20OR%201').run()).resolves.toMatchObject({
      attributes: { tenantId: '1' },
    })
  })

  it('does not call Payload without a cookie', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      (payloadSession as (request: Request) => Promise<unknown>)(new Request('http://test/')),
    ).resolves.toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('agent approvals', () => {
  const session = (canEdit: 'false' | 'true') => ({ auth: { current: { attributes: { canEdit } } } })

  it('lets read tools run', () => {
    expect(decideApproval({ session: session('false'), toolName: 'payload__semanticSearch' })).toBe('not-applicable')
    expect(decideApproval({ session: session('false'), toolName: 'payload__findBlog' })).toBe('not-applicable')
  })

  it('refuses translation for viewers and asks admins', () => {
    expect(decideApproval({ session: session('false'), toolName: 'payload__translatePost' })).toBe('denied')
    expect(decideApproval({ session: session('true'), toolName: 'payload__translatePost' })).toBe('user-approval')
  })

  it('refuses translation when the session has no caller', () => {
    expect(decideApproval({ session: { auth: {} }, toolName: 'payload__translatePost' })).toBe('denied')
  })
})

describe('agent MCP key', () => {
  const getToken = tenantKeyAuth.getToken as (args: { principal: unknown }) => Promise<{ token: string }>

  it('uses the key of the caller’s verified tenant', async () => {
    vi.stubEnv('PAYLOAD_MCP_KEYS', '{"1":"key-one","2":"key-two"}')

    await expect(
      getToken({ principal: { attributes: { tenantId: '2' }, id: '7', type: 'user' } }),
    ).resolves.toEqual({ token: 'key-two' })
  })

  it('fails closed for an unknown tenant or a caller with no tenant', async () => {
    vi.stubEnv('PAYLOAD_MCP_KEYS', '{"1":"key-one"}')

    await expect(
      getToken({ principal: { attributes: { tenantId: '9' }, id: '7', type: 'user' } }),
    ).rejects.toThrow(/no MCP key/)
    await expect(getToken({ principal: { id: '7', type: 'user' } })).rejects.toThrow(/tenant user/)
  })
})
