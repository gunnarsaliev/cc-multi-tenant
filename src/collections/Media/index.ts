import type { CollectionConfig } from 'payload'

import path from 'path'

import {
  superAdminOrTenantAdminAccess,
  superAdminOrTenantAdminCreateAccess,
} from '@/collections/Pages/access/superAdminOrTenantAdmin'

export const Media: CollectionConfig = {
  slug: 'media',
  access: {
    create: superAdminOrTenantAdminCreateAccess,
    delete: superAdminOrTenantAdminAccess,
    read: () => true,
    update: superAdminOrTenantAdminAccess,
  },
  fields: [
    {
      name: 'alt',
      type: 'text',
      required: true,
    },
  ],
  upload: {
    adminThumbnail: 'thumbnail',
    imageSizes: [
      {
        name: 'thumbnail',
        height: 300,
        width: 400,
      },
      {
        name: 'card',
        height: 500,
        width: 800,
      },
      {
        name: 'hero',
        width: 1600,
      },
    ],
    mimeTypes: ['image/*'],
    staticDir: path.resolve(process.cwd(), 'media'),
  },
}
