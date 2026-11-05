'use client'

import type { SlugFieldClientProps } from 'payload'

import { SlugField, useField, useFormFields } from '@payloadcms/ui'
import React, { useEffect, useRef } from 'react'

import { slugify } from '@/utilities/slugify'

/**
 * Fills in the slug while the title is typed, so a new post can be published straight away.
 *
 * It stops once the server clears `generateSlug` on the first save with a title, because
 * changing the slug after that could break live links. A slug typed by hand is never replaced.
 */
export const AutoSlugField: React.FC<SlugFieldClientProps> = (props) => {
  const { path, useAsSlug = 'title' } = props

  const title = useFormFields(([fields]) => fields[useAsSlug]?.value as string | undefined)
  const shouldGenerate = useFormFields(([fields]) => Boolean(fields.generateSlug?.value))
  const { setValue, value } = useField<string>({ path })

  const lastTitle = useRef(title)
  const lastGenerated = useRef('')

  useEffect(() => {
    if (!shouldGenerate || title === lastTitle.current) {
      return
    }

    lastTitle.current = title

    if (value && value !== lastGenerated.current) {
      return
    }

    lastGenerated.current = slugify(title ?? '')
    setValue(lastGenerated.current)
  }, [setValue, shouldGenerate, title, value])

  return <SlugField {...props} />
}
