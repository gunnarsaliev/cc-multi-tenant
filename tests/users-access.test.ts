import type { Payload } from 'payload'

import { beforeAll, describe, expect, it } from 'vitest'

import type { Tenant } from '@/payload-types'

import { createTenant, createUser, getTestPayload } from './helpers/payload'

describe('tenant membership changes', () => {
  let payload: Payload
  let tenantA: Tenant
  let tenantB: Tenant

  const rolesFor = async (userID: number, tenantID: number) => {
    const user = await payload.findByID({ collection: 'users', depth: 0, id: userID })
    return user.tenants?.find((row) => row.tenant === tenantID)?.roles
  }

  beforeAll(async () => {
    payload = await getTestPayload()
    tenantA = await createTenant(payload)
    tenantB = await createTenant(payload)
  })

  it('stops a viewer promoting themselves to tenant-admin', async () => {
    const viewer = await createUser(payload, [{ roles: ['tenant-viewer'], tenant: tenantA.id }])

    await payload
      .update({
        collection: 'users',
        data: { tenants: [{ roles: ['tenant-admin'], tenant: tenantA.id }] },
        id: viewer.id,
        overrideAccess: false,
        user: viewer,
      })
      .catch(() => undefined)

    expect(await rolesFor(viewer.id, tenantA.id)).toEqual(['tenant-viewer'])
  })

  it('stops a user adding themselves to another tenant', async () => {
    const viewer = await createUser(payload, [{ roles: ['tenant-viewer'], tenant: tenantA.id }])

    await payload
      .update({
        collection: 'users',
        data: {
          tenants: [
            { roles: ['tenant-viewer'], tenant: tenantA.id },
            { roles: ['tenant-admin'], tenant: tenantB.id },
          ],
        },
        id: viewer.id,
        overrideAccess: false,
        user: viewer,
      })
      .catch(() => undefined)

    expect(await rolesFor(viewer.id, tenantB.id)).toBeUndefined()
  })

  it('stops a tenant-admin changing a shared user’s roles in another tenant', async () => {
    const admin = await createUser(payload, [{ roles: ['tenant-admin'], tenant: tenantA.id }])
    const member = await createUser(payload, [
      { roles: ['tenant-viewer'], tenant: tenantA.id },
      { roles: ['tenant-viewer'], tenant: tenantB.id },
    ])

    await payload
      .update({
        collection: 'users',
        data: {
          tenants: [
            { roles: ['tenant-viewer'], tenant: tenantA.id },
            { roles: ['tenant-admin'], tenant: tenantB.id },
          ],
        },
        id: member.id,
        overrideAccess: false,
        user: admin,
      })
      .catch(() => undefined)

    expect(await rolesFor(member.id, tenantB.id)).toEqual(['tenant-viewer'])
  })

  it('lets a tenant-admin change roles within their own tenant', async () => {
    const admin = await createUser(payload, [{ roles: ['tenant-admin'], tenant: tenantA.id }])
    const member = await createUser(payload, [{ roles: ['tenant-viewer'], tenant: tenantA.id }])

    await payload.update({
      collection: 'users',
      data: { tenants: [{ roles: ['tenant-admin'], tenant: tenantA.id }] },
      id: member.id,
      overrideAccess: false,
      user: admin,
    })

    expect(await rolesFor(member.id, tenantA.id)).toEqual(['tenant-admin'])
  })

  it('lets a super-admin change any membership', async () => {
    const superAdmin = await createUser(payload, [], ['super-admin'])
    const member = await createUser(payload, [{ roles: ['tenant-viewer'], tenant: tenantA.id }])

    await payload.update({
      collection: 'users',
      data: { tenants: [{ roles: ['tenant-admin'], tenant: tenantB.id }] },
      id: member.id,
      overrideAccess: false,
      user: superAdmin,
    })

    expect(await rolesFor(member.id, tenantB.id)).toEqual(['tenant-admin'])
  })

  it('still lets a viewer update their own non-membership details', async () => {
    const viewer = await createUser(payload, [{ roles: ['tenant-viewer'], tenant: tenantA.id }])

    const updated = await payload.update({
      collection: 'users',
      data: { username: `name-${viewer.id}` },
      id: viewer.id,
      overrideAccess: false,
      user: viewer,
    })

    expect(updated.username).toBe(`name-${viewer.id}`)
    expect(await rolesFor(viewer.id, tenantA.id)).toEqual(['tenant-viewer'])
  })

  // A user's tenant row cannot have an empty tenant, so the row must go before the tenant does.
  it('deletes a tenant that users are still assigned to', async () => {
    const doomed = await createTenant(payload)
    const member = await createUser(payload, [
      { roles: ['tenant-admin'], tenant: doomed.id },
      { roles: ['tenant-viewer'], tenant: tenantB.id },
    ])

    const { errors } = await payload.delete({
      collection: 'tenants',
      where: { id: { equals: doomed.id } },
    })

    expect(errors).toEqual([])
    expect(await payload.count({ collection: 'tenants', where: { id: { equals: doomed.id } } })).toEqual({
      totalDocs: 0,
    })
    expect(await rolesFor(member.id, doomed.id)).toBeUndefined()
    expect(await rolesFor(member.id, tenantB.id)).toEqual(['tenant-viewer'])
  })

  // Bulk deletes handle every tenant at once, and each one rewrites the same user.
  it('deletes several tenants assigned to the same user in one request', async () => {
    const doomed = await Promise.all([createTenant(payload), createTenant(payload), createTenant(payload)])
    const member = await createUser(payload, [
      ...doomed.map((tenant) => ({ roles: ['tenant-admin' as const], tenant: tenant.id })),
      { roles: ['tenant-viewer'], tenant: tenantB.id },
    ])
    const ids = doomed.map((tenant) => tenant.id)

    const { errors } = await payload.delete({ collection: 'tenants', where: { id: { in: ids } } })

    expect(errors).toEqual([])
    expect((await payload.count({ collection: 'tenants', where: { id: { in: ids } } })).totalDocs).toBe(0)

    const user = await payload.findByID({ collection: 'users', depth: 0, id: member.id })

    expect(user.tenants?.map((row) => row.tenant)).toEqual([tenantB.id])
  })
})
