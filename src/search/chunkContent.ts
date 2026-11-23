import { convertLexicalToPlaintext } from '@payloadcms/richtext-lexical/plaintext'

import type { LexicalNode, LexicalState } from '@/translation/lexical'

/** About 400–500 tokens of English; a little fewer in Cyrillic. */
const MAX_CHARACTERS = 1_800
const OVERLAP_CHARACTERS = 200

export type Chunk = { content: string; heading: null | string }

const toPlaintext = (node: LexicalNode, root: LexicalNode) =>
  convertLexicalToPlaintext({
    data: { root: { ...root, children: [node] } } as never,
  }).trim()

/** Splits at sentence ends where it can, and repeats the end of each piece at the next's start. */
const splitLongText = (text: string): string[] => {
  const pieces: string[] = []
  let start = 0

  while (start < text.length) {
    let end = Math.min(start + MAX_CHARACTERS, text.length)

    if (end < text.length) {
      const window = text.slice(start + MAX_CHARACTERS / 2, end)
      const sentenceEnd = Math.max(...['. ', '! ', '? ', '\n'].map((mark) => window.lastIndexOf(mark)))

      if (sentenceEnd >= 0) {
        end = start + MAX_CHARACTERS / 2 + sentenceEnd + 1
      }
    }

    pieces.push(text.slice(start, end).trim())

    if (end === text.length) {
      break
    }

    start = end - OVERLAP_CHARACTERS
  }

  return pieces
}

/** Groups blocks under their nearest heading, so each chunk stays about one topic. */
export const chunkContent = (title: null | string | undefined, state?: LexicalState | null): Chunk[] => {
  const chunks: Chunk[] = []
  let heading: null | string = null
  let buffer: string[] = []

  const flush = () => {
    const text = buffer.join('\n\n').trim()

    if (text) {
      chunks.push(...splitLongText(text).map((content) => ({ content, heading })))
    }

    buffer = []
  }

  for (const node of state?.root?.children ?? []) {
    const text = toPlaintext(node, state!.root)

    if (node.type === 'heading') {
      flush()
      heading = text || null
    } else if (text) {
      if (buffer.join('\n\n').length + text.length > MAX_CHARACTERS) {
        flush()
      }

      buffer.push(text)
    }
  }

  flush()

  // A heading with nothing under it, or a post that's only a title, is still findable.
  if (chunks.length === 0 && (heading || title?.trim())) {
    chunks.push({ content: heading ?? title!.trim(), heading })
  }

  return chunks
}

/** One chunk per question, headed by the question, so a search for it lands on its answer. */
export const chunkFAQ = (
  items: { answer?: LexicalState | null; question?: null | string }[] | null | undefined,
): Chunk[] =>
  (items ?? []).flatMap((item) => {
    const question = item.question?.trim() || null
    const answer = item.answer?.root
      ? convertLexicalToPlaintext({ data: item.answer as never }).trim()
      : ''

    if (!answer) {
      return question ? [{ content: question, heading: question }] : []
    }

    return splitLongText(answer).map((content) => ({ content, heading: question }))
  })
