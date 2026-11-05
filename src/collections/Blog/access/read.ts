import type { Access } from 'payload'

/**
 * Anonymous visitors only see published posts. The multi-tenant plugin
 * limits signed-in users to posts in their own tenants.
 */
export const readAccess: Access = ({ req }) => {
  if (req.user) {
    return true
  }

  return {
    _status: {
      equals: 'published',
    },
  }
}
