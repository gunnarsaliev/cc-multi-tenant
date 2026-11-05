import type { Migration, Payload } from 'payload'

import config from '@payload-config'
import { getPayload } from 'payload'

import type { User } from '@/payload-types'

import { migrations } from '@/migrations'

let cached: Payload | undefined

/** Connects to the test database and applies migrations. */
export const getTestPayload = async (): Promise<Payload> => {
  if (!cached) {
    cached = await getPayload({ config, cron: false })
    await cached.db.migrate({ migrations: migrations as unknown as Migration[] })
  }

  return cached
}

/** The `collection` key is what marks a document as an authenticated user to access control. */
export const asUser = (user: User) => ({ ...user, collection: 'users' as const })

let counter = 0

/** Unique values keep tests independent without truncating tables between them. */
export const unique = (prefix: string) => `${prefix}-${Date.now()}-${++counter}`

export const createTenant = async (payload: Payload, name = unique('tenant')) =>
  payload.create({
    collection: 'tenants',
    data: { allowPublicRead: true, domain: `${name}.test`, name, slug: name },
  })

export const createUser = async (
  payload: Payload,
  tenants: { roles: ('tenant-admin' | 'tenant-viewer')[]; tenant: number }[],
  roles: ('super-admin' | 'user')[] = ['user'],
) =>
  asUser(
    await payload.create({
      collection: 'users',
      data: { email: `${unique('user')}@test.local`, password: 'test', roles, tenants },
    }),
  )
