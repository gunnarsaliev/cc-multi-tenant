import type { Payload } from 'payload'

import type { sql } from '@payloadcms/db-postgres/drizzle'

type SQL = ReturnType<typeof sql>

export type Executor = { execute: (query: SQL) => Promise<{ rows: unknown[] }> }

type Database = Executor & { transaction: <T>(run: (tx: Executor) => Promise<T>) => Promise<T> }

/** `payload.db.drizzle` is typed for Payload's generated schema, which doesn't know this table. */
export const getDatabase = (payload: Payload) => payload.db.drizzle as unknown as Database
