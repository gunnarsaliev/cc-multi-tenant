import type { EmbeddingModel, LanguageModel } from 'ai'

/** Changing this means a schema migration and re-embedding all content. */
export const EMBEDDING_DIMENSIONS = 1536

const DEFAULT_EMBEDDING_MODEL = 'openai/text-embedding-3-small'

/** Offline stand-ins for local development and tests. Never active in production. */
const isMock = () => process.env.AI_MOCK === 'true' && process.env.NODE_ENV !== 'production'

const hasGatewayAccess = () =>
  Boolean(
    process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN || process.env.VERCEL === '1',
  )

export const isTextAIConfigured = () =>
  isMock() || (hasGatewayAccess() && Boolean(process.env.AI_TRANSLATION_MODEL))

export const isEmbeddingAIConfigured = () => isMock() || hasGatewayAccess()

export const getTextModel = async (): Promise<LanguageModel> => {
  if (isMock()) {
    return (await import('./mock')).createMockTextModel()
  }

  const model = process.env.AI_TRANSLATION_MODEL

  if (!model) {
    throw new Error('AI_TRANSLATION_MODEL is not set.')
  }

  return model
}

export const getEmbeddingModelID = () =>
  isMock() ? 'mock/embedding' : (process.env.AI_EMBEDDING_MODEL ?? DEFAULT_EMBEDDING_MODEL)

export const getEmbeddingModel = async (): Promise<EmbeddingModel> =>
  isMock() ? (await import('./mock')).createMockEmbeddingModel() : getEmbeddingModelID()
