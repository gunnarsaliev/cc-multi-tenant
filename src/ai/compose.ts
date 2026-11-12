import { payloadAiPlugin } from '@ai-stack/payloadcms'
import type { GenerationModel } from '@ai-stack/payloadcms/types'
import { APIError, type Access, type PayloadRequest } from 'payload'

import { getAppUser } from '@/access/getAppUser'
import { isSuperAdmin } from '@/access/isSuperAdmin'
import { getUserTenantIDs } from '@/utilities/getUserTenantIDs'

/**
 * Each model adds columns to the instructions table, and the plugin removes the table when it has
 * no models. Migrations can't follow the environment, so the models never depend on which keys are
 * set: always OpenAI's, with a placeholder key until a real one is added.
 */
const OPENAI_MODEL_IDS = ['Oai-text', 'Oai-object', 'gpt-image-1']

/**
 * The plugin only offers DALL-E and gpt-image-1, which OpenAI no longer serves, so its image model
 * is kept for its settings and pointed at a current one. These models don't return the
 * `revised_prompt` the plugin uses as alt text, and `Media.alt` is required.
 */
const IMAGE_MODEL = 'gpt-image-2'

export const withCurrentImageModel = (model: GenerationModel): GenerationModel => {
  const { handler, id } = model

  if (id !== 'gpt-image-1' || !handler) {
    return model
  }

  return {
    ...model,
    handler: async (prompt: string, options: Record<string, unknown>) => {
      const result = await handler(prompt, { ...options, version: IMAGE_MODEL })

      return { ...result, data: { ...result.data, alt: result.data?.alt || prompt } }
    },
  }
}

/** Static prompts, because the plugin's default seeds call the model for every field on startup. */
const SEED_PROMPTS: Record<string, string> = {
  'blog.content':
    'Write a well-structured, informative blog post with an introduction, sections and a conclusion about: {{ title }}',
  'blog.mainImage':
    'A high-quality editorial image for a blog post titled "{{ title }}". No text or typography.',
  'blog.title': 'Write a concise, engaging blog post title about: {{ title }}',
}

const canEditContent = (user: PayloadRequest['user']): boolean =>
  isSuperAdmin(user) || getUserTenantIDs(user, 'tenant-admin').length > 0

export const canGenerate = ({ req }: { req: PayloadRequest }): boolean => {
  if (!canEditContent(req.user)) {
    return false
  }

  if (!process.env.OPENAI_API_KEY) {
    throw new APIError('AI Compose is not configured. Set OPENAI_API_KEY.', 503)
  }

  return true
}

const superAdminOnly: Access = ({ req }) => isSuperAdmin(getAppUser(req.user))

export const composePlugin = payloadAiPlugin({
  access: {
    generate: canGenerate,
    settings: ({ req }) => isSuperAdmin(req.user),
  },
  collections: {
    blog: true,
  },
  disableSponsorMessage: true,
  generationModels: (models) =>
    models.filter(({ id }) => OPENAI_MODEL_IDS.includes(id)).map(withCurrentImageModel),
  // The translate menu only lists tags with a location, so plain `en` and `bg` wouldn't appear.
  options: {
    enabledLanguages: ['bg-BG', 'en-US'],
  },
  // Prompts are shared by all tenants, so editing one is limited to super admins. Readers are
  // whoever can generate: the admin panel hides Compose from anyone else.
  overrideInstructions: {
    access: {
      create: superAdminOnly,
      delete: superAdminOnly,
      read: ({ req }) => canEditContent(req.user),
      update: superAdminOnly,
    },
  },
  providers: {
    openai: {
      apiKey: process.env.OPENAI_API_KEY || 'not-configured',
    },
  },
  seedPrompts: ({ path }) => {
    const prompt = SEED_PROMPTS[path]

    return prompt ? { data: { prompt } } : false
  },
})
