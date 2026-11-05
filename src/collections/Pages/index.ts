import { queueReindexAfterChange, queueReindexAfterDelete } from '@/search/hooks'
import type { CollectionConfig } from 'payload'

import { ensureUniqueSlug } from './hooks/ensureUniqueSlug'
import {
  superAdminOrTenantAdminAccess,
  superAdminOrTenantAdminCreateAccess,
} from '@/collections/Pages/access/superAdminOrTenantAdmin'

export const Pages: CollectionConfig = {
  slug: 'pages',
  access: {
    create: superAdminOrTenantAdminCreateAccess,
    delete: superAdminOrTenantAdminAccess,
    read: () => true,
    update: superAdminOrTenantAdminAccess,
  },
  admin: {
    useAsTitle: 'title',
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      localized: true,
    },
    {
      name: 'slug',
      type: 'text',
      defaultValue: 'home',
      hooks: {
        beforeValidate: [ensureUniqueSlug],
      },
      index: true,
    },
  ],
  hooks: {
    afterChange: [queueReindexAfterChange],
    afterDelete: [queueReindexAfterDelete],
  },
}
