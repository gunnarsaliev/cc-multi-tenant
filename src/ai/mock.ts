import { MockEmbeddingModelV4, MockLanguageModelV4 } from 'ai/test'

import { EMBEDDING_DIMENSIONS } from './models'

const usage = {
  inputTokens: { cacheRead: undefined, cacheWrite: undefined, noCache: 0, total: 0 },
  outputTokens: { reasoning: undefined, text: 0, total: 0 },
}

/** Answers a translation request by prefixing each segment with the target locale. */
export const createMockTextModel = () =>
  new MockLanguageModelV4({
    doGenerate: async ({ prompt }) => {
      const message = prompt
        .filter(({ role }) => role === 'user')
        .flatMap(({ content }) => content as { text?: string; type: string }[])
        .flatMap((part) => (part.type === 'text' && part.text ? [part.text] : []))
        .join('\n')
      const request = JSON.parse(message.slice(message.indexOf('{'))) as {
        segments: { id: string; text: string }[]
        targetLanguage: string
      }
      const segments = request.segments.map(({ id, text }) => ({
        id,
        text: `[${request.targetLanguage}] ${text}`,
      }))

      return {
        content: [{ text: JSON.stringify({ segments }), type: 'text' }],
        finishReason: { raw: undefined, unified: 'stop' },
        usage,
        warnings: [],
      }
    },
  })

const hashWord = (word: string) => {
  let hash = 2166136261

  for (const character of word) {
    hash = Math.imul(hash ^ (character.codePointAt(0) ?? 0), 16777619)
  }

  return (hash >>> 0) % EMBEDDING_DIMENSIONS
}

/** A normalised bag of words, so texts that share words really do come out as similar. */
export const embedText = (text: string): number[] => {
  const vector = new Array<number>(EMBEDDING_DIMENSIONS).fill(0)

  for (const word of text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []) {
    vector[hashWord(word)] += 1
  }

  const length = Math.hypot(...vector)

  // pgvector can't compute cosine distance for an all-zero vector.
  return length === 0
    ? vector.map((_, index) => (index === 0 ? 1 : 0))
    : vector.map((value) => value / length)
}

export const createMockEmbeddingModel = () =>
  new MockEmbeddingModelV4({
    doEmbed: async ({ values }) => ({ embeddings: values.map(embedText), warnings: [] }),
    maxEmbeddingsPerCall: 100,
    modelId: 'embedding',
    provider: 'mock',
  })
