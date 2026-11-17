import type {
  Access,
  CollectionAfterReadHook,
  CollectionBeforeChangeHook,
  CollectionConfig,
  Endpoint,
  PayloadRequest,
} from 'payload'

import { importExportPlugin } from '@payloadcms/plugin-import-export'
import type {
  ImportAfterHook,
  ImportBeforeHook,
  ImportExportPluginConfig,
} from '@payloadcms/plugin-import-export/types'
import { addDataAndFileToRequest, APIError } from 'payload'

import { getAppUser } from '@/access/getAppUser'
import { isSuperAdmin } from '@/access/isSuperAdmin'
import { extractID } from '@/utilities/extractID'
import { getUserTenantIDs } from '@/utilities/getUserTenantIDs'

const mayTransfer = (req: PayloadRequest) =>
  isSuperAdmin(req.user) || getUserTenantIDs(req.user, 'tenant-admin').length > 0

/** Super admins and tenant admins can export and import. Viewers and MCP keys cannot. */
const canTransfer: Access = ({ req }) => mayTransfer(req)

/** An import's summary can quote rows from the file, so only its author and super admins see it. */
const ownOrSuperAdmin: Access = ({ req }) => {
  const user = getAppUser(req.user)

  if (!user) {
    return false
  }

  return isSuperAdmin(user) || { createdBy: { equals: user.id } }
}

const setCreatedBy: CollectionBeforeChangeHook = ({ data, operation, req }) => {
  const user = getAppUser(req.user)

  if (operation === 'create' && user) {
    data.createdBy = user.id
  }

  return data
}

/**
 * Rows naming a tenant the importer does not administer are stopped before anything is written.
 */
export const rejectForeignTenants: ImportBeforeHook = ({ data, req }) => {
  if (isSuperAdmin(req.user)) {
    return data
  }

  const allowed = getUserTenantIDs(req.user, 'tenant-admin').map(String)

  for (const row of data as { tenant?: unknown }[]) {
    if (row.tenant === undefined || row.tenant === null || row.tenant === '') {
      continue
    }

    const tenant = String(extractID(row.tenant as never))

    if (!allowed.includes(tenant)) {
      throw new Error(`Tenant ${tenant} is not one you administer. Nothing in this batch was imported.`)
    }
  }

  return data
}

/**
 * Works around a Payload 3.92 bug. Each imported row is written in its own transaction, and
 * while populating that row's relationships the request's data loader overwrites the upload
 * request's `transactionID` with the row's, which is finished by then. The import's own status
 * update then cannot find the import and rolls it back, although the rows were imported.
 * Remembering the ID before the first batch and putting it back after each batch avoids that.
 */
const uploadTransactions = new WeakMap<PayloadRequest, PayloadRequest['transactionID']>()

const rememberTransaction: ImportBeforeHook = (args) => {
  if (!uploadTransactions.has(args.req)) {
    uploadTransactions.set(args.req, args.req.transactionID)
  }

  return rejectForeignTenants(args)
}

const restoreTransaction: ImportAfterHook = ({ req }) => {
  if (uploadTransactions.has(req)) {
    req.transactionID = uploadTransactions.get(req)
  }
}

/**
 * Users carry roles (including `super-admin`) and tenants decide who can reach what, so only
 * super admins may import them. Exports stay open to whoever can read the rows.
 */
export const superAdminsOnly: ImportBeforeHook = (args) => {
  if (!isSuperAdmin(args.req.user)) {
    throw new Error('Only super admins can import into this collection. Nothing was imported.')
  }

  return rememberTransaction(args)
}

// The job queue only runs once a day on Vercel, so both directions run during the request.
const exportOptions = { disableJobsQueue: true, disableSave: true }

const transfer = {
  export: exportOptions,
  import: { disableJobsQueue: true, hooks: { after: restoreTransaction, before: rememberTransaction } },
}

const superAdminImport = {
  export: exportOptions,
  import: { disableJobsQueue: true, hooks: { after: restoreTransaction, before: superAdminsOnly } },
}

const exportOnly = { export: exportOptions, import: false }

const collections: ImportExportPluginConfig['collections'] = [
  { slug: 'blog', ...transfer },
  { slug: 'blog-categories', ...transfer },
  { slug: 'pages', ...transfer },
  { slug: 'consent-settings', ...transfer },
  { slug: 'users', ...superAdminImport },
  { slug: 'tenants', ...superAdminImport },
  // Rows without their image files would be broken, so media is export only.
  { slug: 'media', ...exportOnly },
  // Consent records are written only by /api/consent/log and never changed afterwards.
  { slug: 'consent-logs', ...exportOnly },
]

const exportable: string[] = collections.filter((c) => c.export !== false).map((c) => c.slug)
const importable: string[] = collections.filter((c) => c.import !== false).map((c) => c.slug)

/**
 * Reads the body once and leaves it readable for the plugin's handler, which parses it again:
 * `req.json()` is replaced by the parsed copy and the spent stream is hidden.
 */
const readData = async (req: PayloadRequest): Promise<Record<string, unknown>> => {
  if (!req.data) {
    await addDataAndFileToRequest(req)
    Object.defineProperty(req, 'body', { configurable: true, value: null })
  }

  if (req.data) {
    return req.data
  }

  if (typeof req.json === 'function') {
    const body = await req.json()
    req.json = () => Promise.resolve(body)

    return body ?? {}
  }

  return {}
}

const refuse = (message: string, status: number) =>
  Response.json({ errors: [{ message }] }, { status })

/**
 * The plugin accepts any existing collection and its endpoints skip collection access, so a
 * request could otherwise export collections that are not listed above, or be sent by viewers.
 */
const guardEndpoint =
  (allowed: string[]) =>
  (endpoint: Endpoint): Endpoint => ({
    ...endpoint,
    handler: async (req) => {
      if (!mayTransfer(req)) {
        return refuse('You are not allowed to import or export.', 403)
      }

      const data = await readData(req)
      const slug = data.collectionSlug ?? (data.data as { collectionSlug?: unknown })?.collectionSlug

      if (typeof slug !== 'string' || !allowed.includes(slug)) {
        return refuse(`Collection "${String(slug)}" cannot be used here.`, 400)
      }

      return endpoint.handler(req)
    },
  })

const onlyAllowedCollections =
  (allowed: string[]): CollectionBeforeChangeHook =>
  ({ data, operation }) => {
    if (operation === 'create' && !allowed.includes(data.collectionSlug)) {
      throw new APIError(`Collection "${data.collectionSlug}" cannot be used here.`, 400, null, true)
    }

    return data
  }

/**
 * The file is never stored, but Payload still gives each doc a `url`. The admin's file preview
 * and the import preview would fetch it and get a 500, so stored docs report no file URL.
 */
const withoutFileURL: CollectionAfterReadHook = ({ doc }) => ({
  ...doc,
  thumbnailURL: null,
  url: null,
})

/**
 * The plugin's `exports` and `imports` collections are open to every logged-in user by default.
 * Files are not kept: exports are downloaded directly and imports are processed during the
 * upload request, so nothing depends on a writable disk or a storage adapter.
 */
const restrict =
  (allowed: string[]) =>
  ({ collection }: { collection: CollectionConfig }): CollectionConfig => ({
    ...collection,
    access: {
      ...collection.access,
      create: canTransfer,
      delete: ownOrSuperAdmin,
      read: ownOrSuperAdmin,
    },
    endpoints: Array.isArray(collection.endpoints)
      ? collection.endpoints.map(guardEndpoint(allowed))
      : collection.endpoints,
    fields: [
      ...collection.fields,
      {
        name: 'createdBy',
        type: 'relationship',
        admin: { hidden: true },
        relationTo: 'users',
      },
    ],
    hooks: {
      ...collection.hooks,
      afterRead: [...(collection.hooks?.afterRead ?? []), withoutFileURL],
      beforeChange: [
        onlyAllowedCollections(allowed),
        ...(collection.hooks?.beforeChange ?? []),
        setCreatedBy,
      ],
    },
    upload: {
      ...(typeof collection.upload === 'object' ? collection.upload : {}),
      disableLocalStorage: true,
    },
  })

export const importExport = importExportPlugin({
  collections,
  // A file without a `_status` column must not publish posts by accident.
  defaultVersionStatus: 'draft',
  overrideExportCollection: restrict(exportable),
  overrideImportCollection: restrict(importable),
})
