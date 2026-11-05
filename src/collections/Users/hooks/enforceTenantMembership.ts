import type { CollectionBeforeChangeHook } from 'payload'

import { Forbidden } from 'payload'

import type { User } from '@/payload-types'

import { isSuperAdmin } from '@/access/isSuperAdmin'
import { extractID } from '@/utilities/extractID'
import { getUserTenantIDs } from '@/utilities/getUserTenantIDs'

type Membership = Map<number, Set<string>>

const toMembership = (rows: User['tenants']): Membership => {
  const membership: Membership = new Map()

  for (const { roles, tenant } of rows ?? []) {
    const tenantID = extractID(tenant)
    const merged = membership.get(tenantID) ?? new Set<string>()
    roles?.forEach((role) => merged.add(role))
    membership.set(tenantID, merged)
  }

  return membership
}

const isSameRoles = (a: Set<string> | undefined, b: Set<string> | undefined): boolean =>
  Boolean(a && b && a.size === b.size && [...a].every((role) => b.has(role)))

/**
 * A user's tenant roles decide what they can reach, so only a super-admin, or a tenant-admin of
 * the tenant concerned, may add, remove or change that tenant's row. Checked here rather than
 * with field access, which cannot see rows being added or removed from the array.
 */
export const enforceTenantMembership: CollectionBeforeChangeHook<User> = ({
  data,
  originalDoc,
  req,
}) => {
  if (!req.user || req.user.collection !== 'users' || isSuperAdmin(req.user) || !data.tenants) {
    return data
  }

  const before = toMembership(originalDoc?.tenants)
  const after = toMembership(data.tenants)
  const adminTenantIDs = getUserTenantIDs(req.user, 'tenant-admin')

  for (const tenantID of new Set([...before.keys(), ...after.keys()])) {
    const isChanged = !isSameRoles(before.get(tenantID), after.get(tenantID))

    if (isChanged && !adminTenantIDs.includes(tenantID)) {
      throw new Forbidden(req.t)
    }
  }

  return data
}
