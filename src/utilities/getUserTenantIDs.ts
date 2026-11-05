import type { Tenant, User } from '../payload-types'
import { type AuthenticatedUser, getAppUser } from '../access/getAppUser'
import { extractID } from './extractID'

/**
 * Returns array of all tenant IDs assigned to a user
 *
 * @param user - User object with tenants field
 * @param role - Optional role to filter by
 */
export const getUserTenantIDs = (
  authenticatedUser: AuthenticatedUser,
  role?: NonNullable<User['tenants']>[number]['roles'][number],
): Tenant['id'][] => {
  const user = getAppUser(authenticatedUser)

  if (!user) {
    return []
  }

  return (
    user?.tenants?.reduce<Tenant['id'][]>((acc, { roles, tenant }) => {
      if (role && !roles.includes(role)) {
        return acc
      }

      if (tenant) {
        acc.push(extractID(tenant))
      }

      return acc
    }, []) || []
  )
}
