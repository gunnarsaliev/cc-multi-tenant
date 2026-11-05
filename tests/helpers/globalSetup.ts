import type { TestProject } from 'vitest/node'

import pg from 'pg'

/** Rebuilds the test database's schema once per run, so migrations are exercised from empty. */
export default async function globalSetup(project: TestProject) {
  const connectionString = project.config.env.POSTGRES_URL as string
  const client = new pg.Client({ connectionString })

  await client.connect()

  const {
    rows: [{ name }],
  } = await client.query<{ name: string }>('SELECT current_database() AS name')

  if (!name.endsWith('_test')) {
    await client.end()
    throw new Error(`Refusing to reset "${name}": the test database name must end in "_test".`)
  }

  await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;')
  await client.end()
}
