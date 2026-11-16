import type { Field } from 'payload'

/**
 * Search and social sharing metadata, stored under `meta`.
 *
 * The names and types match the fields of `@payloadcms/plugin-seo` (`meta.title`,
 * `meta.description`, `meta.image`), so the plugin's field components can replace these later.
 */
export const metaFields: Field[] = [
  {
    name: 'title',
    type: 'text',
    admin: {
      description: 'Shown in search results and browser tabs. Aim for 50 to 60 characters.',
    },
    label: 'Meta title',
    localized: true,
    maxLength: 70,
  },
  {
    name: 'description',
    type: 'textarea',
    admin: {
      description: 'Shown under the title in search results. Aim for 100 to 150 characters.',
    },
    label: 'Meta description',
    localized: true,
    maxLength: 200,
  },
  {
    name: 'image',
    type: 'upload',
    admin: {
      description: 'Shown when the post is shared. The main image is a good default.',
    },
    // Only images from the document's own tenant can be selected.
    filterOptions: ({ data }) =>
      data?.tenant
        ? {
            tenant: {
              equals: data.tenant,
            },
          }
        : true,
    label: 'Meta image',
    relationTo: 'media',
  },
]
