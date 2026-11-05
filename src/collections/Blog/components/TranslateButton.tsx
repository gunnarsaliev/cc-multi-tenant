'use client'

import {
  Button,
  ConfirmationModal,
  toast,
  useConfig,
  useDocumentInfo,
  useFormModified,
  useLocale,
  useModal,
} from '@payloadcms/ui'
import React, { useCallback, useEffect, useState } from 'react'

type Status = {
  canTranslate: boolean
  configured: boolean
  localesWithContent: string[]
}

const OVERWRITE_MODAL = 'confirm-translation-overwrite'

/**
 * Translates the post into the locale selected in the admin, and saves the result as a draft
 * for review. Waits for unsaved edits to be saved, since it works from the stored draft.
 */
export const TranslateButton: React.FC = () => {
  const { id } = useDocumentInfo()
  const {
    config: {
      localization,
      routes: { api },
    },
  } = useConfig()
  const { code: targetLocale, label: targetLabel } = useLocale()
  const isModified = useFormModified()
  const { openModal } = useModal()

  const [status, setStatus] = useState<null | Status>(null)
  const [source, setSource] = useState('')
  const [isTranslating, setIsTranslating] = useState(false)

  const url = `${api}/blog/${id}/translate`

  useEffect(() => {
    if (!id) {
      return
    }

    const controller = new AbortController()

    void fetch(url, { credentials: 'include', signal: controller.signal })
      .then((response) => (response.ok ? (response.json() as Promise<Status>) : null))
      .then(setStatus)
      .catch(() => undefined)

    return () => controller.abort()
  }, [id, isModified, url])

  const sources = (status?.localesWithContent ?? []).filter((code) => code !== targetLocale)
  const selectedSource = sources.includes(source) ? source : sources[0]

  const translate = useCallback(
    async (overwrite: boolean) => {
      setIsTranslating(true)

      try {
        const response = await fetch(url, {
          body: JSON.stringify({ overwrite, sourceLocale: selectedSource, targetLocale }),
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        })

        if (response.ok) {
          // Reloading is what brings the new draft into the form.
          window.location.reload()
          return
        }

        const { error } = (await response.json()) as { error?: string }
        toast.error(error ?? 'Translation failed.')
      } catch {
        toast.error('Translation failed. Check your connection and try again.')
      }

      setIsTranslating(false)
    },
    [selectedSource, targetLocale, url],
  )

  if (!id || !status?.canTranslate || sources.length === 0) {
    return null
  }

  const labelFor = (code: string) => {
    const locale = localization ? localization.locales.find((item) => item.code === code) : null
    return typeof locale?.label === 'string' ? locale.label : code
  }

  const hasTargetContent = status.localesWithContent.includes(targetLocale)
  const title = !status.configured
    ? 'AI translation is not configured yet.'
    : isModified
      ? 'Save your changes before translating.'
      : undefined

  return (
    <div style={{ alignItems: 'center', display: 'flex', gap: '0.5rem' }}>
      <label style={{ alignItems: 'center', display: 'flex', gap: '0.25rem' }}>
        <span>From</span>
        <select
          disabled={isTranslating}
          onChange={(event) => setSource(event.target.value)}
          value={selectedSource}
        >
          {sources.map((code) => (
            <option key={code} value={code}>
              {labelFor(code)}
            </option>
          ))}
        </select>
      </label>
      <Button
        buttonStyle="secondary"
        disabled={!status.configured || isModified || isTranslating}
        margin={false}
        onClick={() => (hasTargetContent ? openModal(OVERWRITE_MODAL) : void translate(false))}
        size="medium"
        tooltip={title}
      >
        {isTranslating ? 'Translating…' : 'Translate'}
      </Button>
      <ConfirmationModal
        body={`This post already has content in ${String(targetLabel)}. Translating replaces it in a new draft. Earlier versions stay in the version history.`}
        confirmLabel="Replace"
        heading="Replace this translation?"
        modalSlug={OVERWRITE_MODAL}
        onConfirm={() => translate(true)}
      />
    </div>
  )
}
