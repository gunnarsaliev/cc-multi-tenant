import type { PayloadRequest } from 'payload'

// The MCP plugin is built on Zod 3, so its tool schemas must be too.
import { z } from 'zod/v3'

import type { User } from '@/payload-types'

import { isEmbeddingAIConfigured } from '@/ai/models'
import { isSuperAdmin } from '@/access/isSuperAdmin'
import { searchContent } from '@/search/searchContent'
import { translatePost, TranslationRequestError } from '@/translation/translatePost'
import { getUserTenantIDs } from '@/utilities/getUserTenantIDs'

const reply = (value: unknown) => ({
  content: [
    { text: typeof value === 'string' ? value : JSON.stringify(value), type: 'text' as const },
  ],
})

const getUser = (req: PayloadRequest) =>
  req.user?.collection === 'users' ? (req.user as { collection: 'users' } & User) : null

/** The caller's tenant, taken from their memberships. A tenant argument can only narrow it. */
const resolveTenantID = (user: User, requested: number | undefined): number | string => {
  const tenantIDs = getUserTenantIDs(user)

  if (requested !== undefined) {
    return isSuperAdmin(user) || tenantIDs.includes(requested)
      ? requested
      : 'You do not have access to that tenant.'
  }

  return tenantIDs.length === 1 && !isSuperAdmin(user)
    ? tenantIDs[0]
    : 'Set tenantId to say which tenant to search.'
}

export const semanticSearchTool = {
  description:
    'Search published content by meaning and keywords, within one tenant and language. Returns the best-matching passage from each document.',
  handler: async (args: Record<string, unknown>, req: PayloadRequest) => {
    const user = getUser(req)

    if (!user) {
      return reply('Error: this tool needs a user.')
    }

    const tenantID = resolveTenantID(user, args.tenantId as number | undefined)

    if (typeof tenantID === 'string') {
      return reply(`Error: ${tenantID}`)
    }

    if (!isEmbeddingAIConfigured()) {
      return reply('Error: search is not configured.')
    }

    const localization = req.payload.config.localization
    const locale = (args.locale as string | undefined) ?? (localization ? localization.defaultLocale : 'en')

    if (localization && !localization.localeCodes.includes(locale)) {
      return reply(`Error: unknown locale. Use one of: ${localization.localeCodes.join(', ')}.`)
    }

    return reply(
      await searchContent({
        limit: args.limit as number | undefined,
        locale,
        payload: req.payload,
        query: args.query as string,
        tenantId: tenantID,
      }),
    )
  },
  name: 'semanticSearch',
  parameters: {
    limit: z.number().int().min(1).max(50).optional().describe('Maximum results. Defaults to 10.'),
    locale: z.string().optional().describe('Language code to search in, such as en or bg.'),
    query: z.string().min(1).max(500).describe('What to look for, in natural language.'),
    tenantId: z
      .number()
      .int()
      .optional()
      .describe('Only needed when your user belongs to more than one tenant.'),
  },
}

export const translatePostTool = {
  description:
    'Translate a blog post into another language and save it as a draft for human review. It never publishes. Fails if the target language already has content, unless overwrite is true.',
  handler: async (args: Record<string, unknown>, req: PayloadRequest) => {
    const user = getUser(req)

    if (!user) {
      return reply('Error: this tool needs a user.')
    }

    try {
      return reply(
        await translatePost({
          id: args.id as number,
          overwrite: args.overwrite as boolean | undefined,
          payload: req.payload,
          sourceLocale: args.sourceLocale as string | undefined,
          targetLocale: args.targetLocale as string,
          user,
        }),
      )
    } catch (error) {
      if (error instanceof TranslationRequestError) {
        return reply(`Error: ${error.message}`)
      }

      // Not found and not allowed look the same, as they do on the REST endpoint.
      return reply('Error: post not found.')
    }
  },
  name: 'translatePost',
  parameters: {
    id: z.number().int().describe('The blog post ID.'),
    overwrite: z.boolean().optional().describe('Replace existing content in the target language.'),
    sourceLocale: z.string().optional().describe('Language to translate from. Chosen automatically if not set.'),
    targetLocale: z.string().describe('Language to translate into, such as en or bg.'),
  },
}
