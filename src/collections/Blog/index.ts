import { queueReindexAfterChange, queueReindexAfterDelete } from '@/search/hooks'
import type { CollectionConfig, TextField } from 'payload'

import { slugField } from 'payload'

import {
  superAdminOrTenantAdminAccess,
  superAdminOrTenantAdminCreateAccess,
} from '@/collections/Pages/access/superAdminOrTenantAdmin'
import { slugify } from '@/utilities/slugify'
import { readAccess } from './access/read'
import { translateEndpoint, translationStatusEndpoint } from './endpoints/translate'
import { normalizeSlug } from './hooks/normalizeSlug'

export const Blog: CollectionConfig = {
  slug: 'blog',
  labels: {
    plural: 'Blog',
    singular: 'Blog Post',
  },
  access: {
    create: superAdminOrTenantAdminCreateAccess,
    delete: superAdminOrTenantAdminAccess,
    read: readAccess,
    update: superAdminOrTenantAdminAccess,
  },
  admin: {
    components: {
      edit: {
        beforeDocumentControls: ['@/collections/Blog/components/TranslateButton#TranslateButton'],
      },
    },
    defaultColumns: ['title', 'slug', '_status', 'updatedAt'],
    useAsTitle: 'title',
  },
  endpoints: [translationStatusEndpoint, translateEndpoint],
  fields: [
    {
      name: 'title',
      type: 'text',
      localized: true,
      required: true,
    },
    {
      name: 'mainImage',
      type: 'upload',
      // Only images from the post's own tenant can be selected.
      filterOptions: ({ data }) =>
        data?.tenant
          ? {
              tenant: {
                equals: data.tenant,
              },
            }
          : true,
      relationTo: 'media',
    },
    {
      name: 'content',
      type: 'richText',
      localized: true,
    },
    // Adds the lock, unlock and generate controls to the slug in the admin panel.
    // A post has one slug across locales, unique per tenant through the compound index below.
    slugField({
      disableUnique: true,
      overrides: (row) => {
        const slug = row.fields[1] as TextField

        slug.admin = {
          ...slug.admin,
          components: {
            Field: {
              clientProps: { useAsSlug: 'title' },
              path: '@/collections/Blog/components/AutoSlugField#AutoSlugField',
            },
          },
        }

        return row
      },
      // No slug rather than an empty one, which the unique index would allow only once per tenant.
      slugify: ({ valueToSlugify }) => slugify(valueToSlugify ?? '') || undefined,
      useAsSlug: 'title',
    }),
  ],
  hooks: {
    afterChange: [queueReindexAfterChange],
    afterDelete: [queueReindexAfterDelete],
    beforeValidate: [normalizeSlug],
  },
  indexes: [
    {
      fields: ['tenant', 'slug'],
      unique: true,
    },
  ],
  versions: {
    drafts: true,
    maxPerDoc: 50,
  },
}
