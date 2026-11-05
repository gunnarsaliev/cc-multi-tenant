import type { LanguageModel } from 'ai'
import type { Payload, TypedLocale } from 'payload'

import type { User } from '@/payload-types'

import { isTextAIConfigured } from '@/ai/models'
import { isSuperAdmin } from '@/access/isSuperAdmin'
import { extractID } from '@/utilities/extractID'
import { getUserTenantIDs } from '@/utilities/getUserTenantIDs'

import { hasContent, InvalidTranslationError, type LexicalState } from './lexical'
import { translateContent } from './translateContent'

export class TranslationRequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

type Authenticated = { collection: 'users' } & User

type LocalizedPost = {
  content?: null | Record<string, LexicalState | null>
  tenant?: unknown
  title?: null | Record<string, null | string>
}

const getLocaleCodes = (payload: Payload): string[] => {
  const { localization } = payload.config
  return localization ? localization.localeCodes : []
}

/** `locale: 'all'` gives each locale's stored value, with no fallback to another locale. */
const readAllLocales = async (payload: Payload, id: number | string, user: Authenticated) =>
  (await payload.findByID({
    collection: 'blog',
    depth: 0,
    draft: true,
    id,
    locale: 'all' as TypedLocale,
    overrideAccess: false,
    user,
  })) as unknown as LocalizedPost

const localeHasContent = (post: LocalizedPost, locale: string) =>
  Boolean(post.title?.[locale]?.trim()) || hasContent(post.content?.[locale])

const canUpdate = (post: LocalizedPost, user: Authenticated) =>
  isSuperAdmin(user) ||
  getUserTenantIDs(user, 'tenant-admin').includes(extractID(post.tenant as number))

export const getTranslationStatus = async ({
  id,
  payload,
  user,
}: {
  id: number | string
  payload: Payload
  user: Authenticated
}) => {
  const post = await readAllLocales(payload, id, user)

  return {
    canTranslate: canUpdate(post, user),
    configured: isTextAIConfigured(),
    localesWithContent: getLocaleCodes(payload).filter((locale) => localeHasContent(post, locale)),
  }
}

export type TranslatePostArgs = {
  id: number | string
  model?: LanguageModel
  overwrite?: boolean
  payload: Payload
  sourceLocale?: string
  targetLocale: string
  user: Authenticated
}

/** Translates a post's latest draft and saves the result as a draft in the target locale. */
export const translatePost = async ({
  id,
  model,
  overwrite = false,
  payload,
  sourceLocale,
  targetLocale,
  user,
}: TranslatePostArgs) => {
  const locales = getLocaleCodes(payload)

  if (!locales.includes(targetLocale) || (sourceLocale && !locales.includes(sourceLocale))) {
    throw new TranslationRequestError(400, 'Unknown locale.')
  }

  if (!model && !isTextAIConfigured()) {
    throw new TranslationRequestError(503, 'AI translation is not configured.')
  }

  const post = await readAllLocales(payload, id, user)

  // Checked before calling the model, so a refused request costs nothing.
  if (!canUpdate(post, user)) {
    throw new TranslationRequestError(403, 'You are not allowed to translate this post.')
  }

  const defaultLocale = payload.config.localization
    ? payload.config.localization.defaultLocale
    : undefined
  const source =
    sourceLocale ??
    [defaultLocale, ...locales].find(
      (locale): locale is string =>
        Boolean(locale) && locale !== targetLocale && localeHasContent(post, locale as string),
    )

  if (!source || source === targetLocale || !localeHasContent(post, source)) {
    throw new TranslationRequestError(422, 'There is no other version of this post to translate.')
  }

  if (!overwrite && localeHasContent(post, targetLocale)) {
    throw new TranslationRequestError(409, `This post already has content in "${targetLocale}".`)
  }

  let translated: Awaited<ReturnType<typeof translateContent>>

  try {
    translated = await translateContent({
      content: post.content?.[source],
      model,
      sourceLocale: source,
      targetLocale,
      title: post.title?.[source],
    })
  } catch (error) {
    payload.logger.error({ err: error, msg: `Translating blog post ${id} failed.` })

    throw new TranslationRequestError(
      502,
      error instanceof InvalidTranslationError
        ? 'The translation came back damaged, so nothing was saved. Please try again.'
        : 'The translation service failed, so nothing was saved. Please try again.',
    )
  }

  await payload.update({
    collection: 'blog',
    data: {
      ...(translated.title ? { title: translated.title } : {}),
      ...(translated.content ? { content: translated.content as never } : {}),
    },
    draft: true,
    id,
    locale: targetLocale as TypedLocale,
    overrideAccess: false,
    user,
  })

  return { sourceLocale: source, targetLocale }
}
