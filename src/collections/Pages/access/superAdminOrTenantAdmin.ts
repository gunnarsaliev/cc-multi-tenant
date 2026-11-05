import { getUserTenantIDs } from '@/utilities/getUserTenantIDs'
import { isSuperAdmin } from '../../../access/isSuperAdmin'
import { Access } from 'payload'

/**
 * Tenant admins and super admins are allowed to create pages.
 *
 * `req.data` is empty when the admin panel evaluates permissions, so a tenant is only
 * checked when one is being written. The tenant field itself is required on create.
 */
export const superAdminOrTenantAdminCreateAccess: Access = ({ req }) => {
  if (!req.user) {
    return false
  }

  if (isSuperAdmin(req.user)) {
    return true
  }

  const adminTenantAccessIDs = getUserTenantIDs(req.user, 'tenant-admin')
  const requestedTenant = req.data?.tenant

  if (requestedTenant) {
    return adminTenantAccessIDs.includes(requestedTenant)
  }

  return adminTenantAccessIDs.length > 0
}

/**
 * Tenant admins can update and delete pages in their own tenants, and super admins can
 * update and delete any page. A page cannot be moved to a tenant the user does not administer.
 */
export const superAdminOrTenantAdminAccess: Access = ({ req }) => {
  if (!req.user) {
    return false
  }

  if (isSuperAdmin(req.user)) {
    return true
  }

  const adminTenantAccessIDs = getUserTenantIDs(req.user, 'tenant-admin')
  const requestedTenant = req.data?.tenant

  if (
    adminTenantAccessIDs.length === 0 ||
    (requestedTenant && !adminTenantAccessIDs.includes(requestedTenant))
  ) {
    return false
  }

  return {
    tenant: {
      in: adminTenantAccessIDs,
    },
  }
}
