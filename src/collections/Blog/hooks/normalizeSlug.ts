import type { CollectionBeforeValidateHook } from 'payload'

import { slugify } from '@/utilities/slugify'

/**
 * Prepares the slug before validation, which runs ahead of `slugField`'s own generation.
 * A post published in a single request would otherwise fail with "Slug is required", and
 * a slug typed by hand as "My Post" would be stored as is and produce a broken URL.
 */
export const normalizeSlug: CollectionBeforeValidateHook = ({ data, originalDoc }) => {
  if (!data || (data.slug === undefined && originalDoc?.slug)) {
    return data
  }

  const source = data.slug || data.title || originalDoc?.title

  if (source) {
    data.slug = slugify(source) || undefined
  }

  return data
}
