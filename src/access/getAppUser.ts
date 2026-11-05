import type { PayloadRequest } from 'payload'

import type { User } from '@/payload-types'

export type AuthenticatedUser = null | PayloadRequest['user'] | undefined | User

/**
 * The person behind a request, or null.
 *
 * MCP API keys can also authenticate on the REST API, and then `req.user` is the key document.
 * It has no tenants or roles, and its ID can match an unrelated user's. A key only ever acts as
 * its owner through the MCP endpoint, so everywhere else it must count as not being logged in.
 */
export const getAppUser = (user: AuthenticatedUser): null | User =>
  user && user.collection !== 'payload-mcp-api-keys' ? (user as User) : null
