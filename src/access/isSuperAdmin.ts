import type { Access } from 'payload'

import { type AuthenticatedUser, getAppUser } from './getAppUser'

export const isSuperAdminAccess: Access = ({ req }): boolean => {
  return isSuperAdmin(req.user)
}

export const isSuperAdmin = (user: AuthenticatedUser): boolean => {
  return Boolean(getAppUser(user)?.roles?.includes('super-admin'))
}
