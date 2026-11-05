/**
 * Lexical JSON <-> translatable text.
 *
 * Each block's inline content becomes one string, so the model sees whole sentences and can
 * reorder them. Inline nodes become tags that point back at the original node:
 *
 *   Read <t0>the <t1>docs</t1></t0> at <c2/>
 *
 *   <tN>…</tN>  text with formatting, or a link; the content is translated
 *   <cN/>       inline code; kept as is
 *   <aN/>       a line break, tab or inline block; kept as is
 */

export type LexicalNode = {
  [key: string]: unknown
  children?: LexicalNode[]
  type: string
}

export type LexicalState = { root: LexicalNode }

export type Segment = { id: string; text: string }

/** A segment's tags, mapped to the nodes they stand for. */
export type SegmentTags = Map<string, LexicalNode>

export class InvalidTranslationError extends Error {}

const INLINE_CONTAINERS = new Set(['autolink', 'link'])
const INLINE_ATOMS = new Set(['inlineBlock', 'linebreak', 'tab'])
/** Blocks whose contents are not prose to translate. */
const OPAQUE_BLOCKS = new Set(['block', 'code'])
const CODE_FORMAT = 16

const isInline = ({ type }: LexicalNode) =>
  type === 'text' || INLINE_CONTAINERS.has(type) || INLINE_ATOMS.has(type)

export const escapeText = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export const unescapeText = (text: string) =>
  text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')

type Tags = SegmentTags

const serialize = (nodes: LexicalNode[], tags: Tags): string =>
  nodes
    .map((node) => {
      const nextTag = (prefix: 'a' | 'c' | 't') => {
        const tag = `${prefix}${tags.size}`
        tags.set(tag, node)
        return tag
      }

      if (node.type === 'text') {
        const format = (node.format as number | undefined) ?? 0

        if (format & CODE_FORMAT) {
          return `<${nextTag('c')}/>`
        }

        const text = escapeText((node.text as string | undefined) ?? '')

        if (format === 0 && !node.style) {
          return text
        }

        const tag = nextTag('t')
        return `<${tag}>${text}</${tag}>`
      }

      if (INLINE_CONTAINERS.has(node.type)) {
        const tag = nextTag('t')
        return `<${tag}>${serialize(node.children ?? [], tags)}</${tag}>`
      }

      return `<${nextTag('a')}/>`
    })
    .join('')

const plainText = (text: string): LexicalNode => ({
  detail: 0,
  format: 0,
  mode: 'normal',
  style: '',
  text,
  type: 'text',
  version: 1,
})

/** Turns a translated string back into inline nodes, checking every tag came back exactly once. */
const parse = (translation: string, tags: Tags): LexicalNode[] => {
  const seen = new Set<string>()
  const output: LexicalNode[] = []
  const open: { children: LexicalNode[]; tag: string }[] = []
  const current = () => open.at(-1)?.children ?? output

  const addText = (raw: string) => {
    if (raw) {
      current().push(plainText(unescapeText(raw)))
    }
  }

  const useTag = (tag: string) => {
    if (!tags.has(tag) || seen.has(tag)) {
      throw new InvalidTranslationError(`Unexpected or repeated tag <${tag}>.`)
    }

    seen.add(tag)
  }

  let position = 0

  for (const match of translation.matchAll(/<(\/?)([act]\d+)(\/?)>/g)) {
    addText(translation.slice(position, match.index))
    position = match.index + match[0].length

    const [, closing, tag, selfClosing] = match

    if (selfClosing) {
      useTag(tag)

      if (tag.startsWith('t')) {
        throw new InvalidTranslationError(`Tag <${tag}> must wrap text.`)
      }

      current().push(structuredClone(tags.get(tag)!))
    } else if (closing) {
      const entry = open.pop()

      if (entry?.tag !== tag) {
        throw new InvalidTranslationError(`Mismatched closing tag </${tag}>.`)
      }

      const source = tags.get(tag)!

      if (source.type === 'text') {
        const [only] = entry.children

        if (entry.children.length !== 1 || only.type !== 'text' || !only.text) {
          throw new InvalidTranslationError(`Formatted tag <${tag}> must contain only text.`)
        }

        current().push({ ...structuredClone(source), text: only.text })
      } else {
        if (entry.children.length === 0) {
          throw new InvalidTranslationError(`Link tag <${tag}> is empty.`)
        }

        current().push({ ...structuredClone(source), children: entry.children })
      }
    } else {
      useTag(tag)

      if (!tag.startsWith('t')) {
        throw new InvalidTranslationError(`Tag <${tag}> must be self-closing.`)
      }

      open.push({ children: [], tag })
    }
  }

  addText(translation.slice(position))

  if (open.length > 0) {
    throw new InvalidTranslationError(`Tag <${open.at(-1)!.tag}> was not closed.`)
  }

  if (seen.size !== tags.size) {
    const missing = [...tags.keys()].filter((tag) => !seen.has(tag))
    throw new InvalidTranslationError(`Missing tags: ${missing.join(', ')}.`)
  }

  return output
}

/** Visits each run of inline nodes in document order, optionally replacing it. */
const mapInlineRuns = (
  node: LexicalNode,
  visit: (run: LexicalNode[]) => LexicalNode[],
): LexicalNode => {
  if (OPAQUE_BLOCKS.has(node.type) || !Array.isArray(node.children)) {
    return node
  }

  const children: LexicalNode[] = []
  let run: LexicalNode[] = []

  const flush = () => {
    if (run.length > 0) {
      children.push(...visit(run))
      run = []
    }
  }

  for (const child of node.children) {
    if (isInline(child)) {
      run.push(child)
    } else {
      flush()
      children.push(mapInlineRuns(child, visit))
    }
  }

  flush()

  return { ...node, children }
}

/** Runs with no letters, like "2024" or a lone line break, stay exactly as they are. */
const isTranslatable = (text: string) => /\p{L}/u.test(text.replace(/<[^>]+>/g, ''))

const forEachSegment = (
  state: LexicalState,
  visit: (segment: Segment, run: LexicalNode[], tags: Tags) => LexicalNode[],
): LexicalState => {
  let index = 0

  return {
    ...state,
    root: mapInlineRuns(state.root, (run) => {
      const tags: Tags = new Map()
      const text = serialize(run, tags)

      if (!isTranslatable(text)) {
        return run
      }

      return visit({ id: `s${index++}`, text }, run, tags)
    }),
  }
}

export const extractSegments = (
  state: LexicalState,
): { segments: Segment[]; tagsByID: Map<string, SegmentTags> } => {
  const segments: Segment[] = []
  const tagsByID = new Map<string, SegmentTags>()

  forEachSegment(state, (segment, run, tags) => {
    segments.push(segment)
    tagsByID.set(segment.id, tags)
    return run
  })

  return { segments, tagsByID }
}

/** Throws `InvalidTranslationError` when a segment is missing or its tags were altered. */
export const applyTranslations = (
  state: LexicalState,
  translations: Record<string, string>,
): LexicalState =>
  forEachSegment(state, ({ id }, _run, tags) => {
    const translation = translations[id]

    if (!translation?.trim()) {
      throw new InvalidTranslationError(`Segment ${id} has no translation.`)
    }

    return parse(translation, tags)
  })

/** Throws `InvalidTranslationError` when a segment is empty or its tags were altered. */
export const validateSegment = (id: string, tags: SegmentTags, translation: string) => {
  if (!translation.trim()) {
    throw new InvalidTranslationError(`Segment ${id} is empty.`)
  }

  parse(translation, tags)
}

const hasContentNode = (node: LexicalNode): boolean => {
  if (node.type === 'text') {
    return Boolean((node.text as string | undefined)?.trim())
  }

  if (Array.isArray(node.children)) {
    return node.children.some(hasContentNode)
  }

  return !isInline(node)
}

/** True when the editor holds text, an upload or a block, rather than an empty paragraph. */
export const hasContent = (state: LexicalState | null | undefined): boolean =>
  Boolean(state?.root && hasContentNode(state.root))
