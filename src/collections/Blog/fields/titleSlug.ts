import type { Field, TextField } from 'payload'

import { slugField } from 'payload'

import { slugify } from '@/utilities/slugify'

/**
 * A slug generated from the title, with the lock, unlock and generate controls in the admin panel.
 * A document has one slug across locales. It is not unique on its own: the collection needs a
 * compound `['tenant', 'slug']` index, and the `normalizeSlug` hook to prepare the value.
 */
export const titleSlugField = (): Field =>
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
  })
