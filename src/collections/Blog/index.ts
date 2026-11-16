import { PayloadAiPluginLexicalEditorFeature } from '@ai-stack/payloadcms'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { queueReindexAfterChange, queueReindexAfterDelete } from '@/search/hooks'
import type { CollectionConfig } from 'payload'

import {
  superAdminOrTenantAdminAccess,
  superAdminOrTenantAdminCreateAccess,
} from '@/collections/Pages/access/superAdminOrTenantAdmin'
import { readAccess } from './access/read'
import { metaFields } from './fields/meta'
import { titleSlugField } from './fields/titleSlug'
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
    defaultColumns: ['title', 'slug', 'categories', '_status', 'updatedAt'],
    useAsTitle: 'title',
  },
  endpoints: [translationStatusEndpoint, translateEndpoint],
  fields: [
    {
      type: 'tabs',
      tabs: [
        {
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
              editor: lexicalEditor({
                features: ({ rootFeatures }) => [
                  ...rootFeatures,
                  PayloadAiPluginLexicalEditorFeature(),
                ],
              }),
              localized: true,
            },
            // A post has one slug across locales, unique per tenant through the compound index below.
            titleSlugField(),
          ],
          label: 'Content',
        },
        {
          name: 'meta',
          fields: metaFields,
          label: 'SEO',
        },
      ],
    },
    {
      name: 'categories',
      type: 'relationship',
      admin: {
        position: 'sidebar',
      },
      // Only categories from the post's own tenant can be selected.
      filterOptions: ({ data }) =>
        data?.tenant
          ? {
              tenant: {
                equals: data.tenant,
              },
            }
          : true,
      hasMany: true,
      relationTo: 'blog-categories',
    },
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
