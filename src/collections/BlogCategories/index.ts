import type { CollectionConfig } from 'payload'

import { titleSlugField } from '@/collections/Blog/fields/titleSlug'
import { normalizeSlug } from '@/collections/Blog/hooks/normalizeSlug'
import {
  superAdminOrTenantAdminAccess,
  superAdminOrTenantAdminCreateAccess,
} from '@/collections/Pages/access/superAdminOrTenantAdmin'

export const BlogCategories: CollectionConfig = {
  slug: 'blog-categories',
  labels: {
    plural: 'Blog Categories',
    singular: 'Blog Category',
  },
  access: {
    create: superAdminOrTenantAdminCreateAccess,
    delete: superAdminOrTenantAdminAccess,
    read: () => true,
    update: superAdminOrTenantAdminAccess,
  },
  admin: {
    defaultColumns: ['title', 'slug', 'updatedAt'],
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
      name: 'description',
      type: 'textarea',
      localized: true,
    },
    titleSlugField(),
    // The posts in this category, read through the `categories` field on the blog collection.
    {
      name: 'posts',
      type: 'join',
      admin: {
        allowCreate: false,
        defaultColumns: ['title', '_status', 'updatedAt'],
      },
      collection: 'blog',
      on: 'categories',
    },
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
}
