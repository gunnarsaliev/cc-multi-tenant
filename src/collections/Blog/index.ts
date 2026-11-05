import type { CollectionConfig, TextField } from 'payload'

import { slugField } from 'payload'

import {
  superAdminOrTenantAdminAccess,
  superAdminOrTenantAdminCreateAccess,
} from '@/collections/Pages/access/superAdminOrTenantAdmin'
import { slugify } from '@/utilities/slugify'
import { readAccess } from './access/read'
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
    defaultColumns: ['title', 'slug', '_status', 'updatedAt'],
    useAsTitle: 'title',
  },
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
