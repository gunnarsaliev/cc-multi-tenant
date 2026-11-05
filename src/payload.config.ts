import { mongooseAdapter } from '@payloadcms/db-mongodb'
import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { buildConfig } from 'payload'
import sharp from 'sharp'
import { fileURLToPath } from 'url'

import { Blog } from './collections/Blog'
import { reindexDocumentTask } from './jobs/reindexDocument'
import { searchEndpoint } from './search/endpoint'
import { addContentChunksTable } from './search/schema'
import { Media } from './collections/Media'
import { Pages } from './collections/Pages'
import { Tenants } from './collections/Tenants'
import Users from './collections/Users'
import { multiTenantPlugin } from '@payloadcms/plugin-multi-tenant'
import { isSuperAdmin } from './access/isSuperAdmin'
import type { Config } from './payload-types'
import { getUserTenantIDs } from './utilities/getUserTenantIDs'
import { seed } from './seed'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

// eslint-disable-next-line no-restricted-exports
export default buildConfig({
  admin: {
    user: 'users',
  },
  collections: [Pages, Blog, Media, Users, Tenants],
  // db: mongooseAdapter({
  //   url: process.env.DATABASE_URL as string,
  // }),
  db: postgresAdapter({
    afterSchemaInit: [addContentChunksTable],
    migrationDir: path.resolve(dirname, 'migrations'),
    pool: {
      connectionString: process.env.POSTGRES_URL,
    },
    // The schema is managed by migrations in every environment. Dev-mode push would try to
    // drop or rewrite anything it does not recognise, including pgvector columns and indexes.
    push: false,
  }),
  jobs: {
    access: {
      // Logged-in users, or Vercel Cron presenting CRON_SECRET.
      run: ({ req }) => {
        if (req.user) {
          return true
        }

        const secret = process.env.CRON_SECRET

        return Boolean(secret) && req.headers.get('authorization') === `Bearer ${secret}`
      },
    },
    // Vercel runs jobs through the cron in vercel.json; anywhere else, the server does it.
    autoRun: process.env.VERCEL ? undefined : [{ cron: '* * * * *', limit: 20, queue: 'default' }],
    tasks: [reindexDocumentTask],
  },
  localization: {
    defaultLocale: 'en',
    fallback: true,
    locales: [
      {
        code: 'en',
        fallbackLocale: 'bg',
        label: 'English',
      },
      {
        code: 'bg',
        fallbackLocale: 'en',
        label: 'Български',
      },
    ],
  },
  onInit: async (args) => {
    if (!process.env.SEED_DB) {
      return
    }

    // `pnpm dev` no longer wipes the database, so seed only an empty one.
    const { totalDocs } = await args.count({ collection: 'tenants' })

    if (totalDocs === 0) {
      await seed(args)
    }
  },
  editor: lexicalEditor({}),
  endpoints: [searchEndpoint],
  graphQL: {
    schemaOutputFile: path.resolve(dirname, 'generated-schema.graphql'),
  },
  secret: process.env.PAYLOAD_SECRET as string,
  sharp,
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  plugins: [
    multiTenantPlugin<Config>({
      collections: {
        blog: {},
        media: {},
        pages: {},
      },
      tenantField: {
        access: {
          read: () => true,
          update: ({ req }) => {
            if (isSuperAdmin(req.user)) {
              return true
            }
            return getUserTenantIDs(req.user).length > 0
          },
        },
      },
      tenantsArrayField: {
        includeDefaultField: false,
      },
      userHasAccessToAllTenants: (user) => isSuperAdmin(user),
    }),
  ],
})
