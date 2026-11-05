import { describe, expect, it } from 'vitest'

import {
  applyTranslations,
  extractSegments,
  hasContent,
  InvalidTranslationError,
  type LexicalNode,
  type LexicalState,
} from '@/translation/lexical'

const text = (value: string, format = 0): LexicalNode => ({
  detail: 0,
  format,
  mode: 'normal',
  style: '',
  text: value,
  type: 'text',
  version: 1,
})

const block = (type: string, children: LexicalNode[], extra = {}): LexicalNode => ({
  children,
  direction: 'ltr',
  format: '',
  indent: 0,
  type,
  version: 1,
  ...extra,
})

const link = { fields: { linkType: 'custom', newTab: true, url: 'https://example.com/a?b=1' } }
const upload: LexicalNode = { relationTo: 'media', type: 'upload', value: 7, version: 3 }

const state: LexicalState = {
  root: block('root', [
    block('heading', [text('A heading')], { tag: 'h2' }),
    block('paragraph', [
      text('Read '),
      text('the bold', 1),
      text(' and '),
      block('link', [text('the '), text('docs', 2)], link),
      text(' with '),
      text('npm install', 16),
      { type: 'linebreak', version: 1 },
      text('then stop.'),
    ]),
    upload,
    block('list', [
      block('listitem', [
        text('Outer item'),
        block('list', [block('listitem', [text('Inner item')], { value: 1 })], { tag: 'ul' }),
      ]),
    ]),
    block('paragraph', [text('2024')]),
    block('paragraph', [text('Uses <angle> & ampersand')]),
  ]),
}

/** Uppercasing leaves the tags alone, so the expected result is easy to read. */
const upper = (value: string) =>
  value.replace(/(<[^>]+>|&\w+;)|([^<&]+)/g, (_, tag, words) => tag ?? words.toUpperCase())

const translateAll = (source: LexicalState) => {
  const { segments } = extractSegments(source)
  return Object.fromEntries(segments.map(({ id, text: value }) => [id, upper(value)]))
}

describe('Lexical translation', () => {
  it('creates one segment per block of inline text, keeping fixed items out of the text', () => {
    const { segments } = extractSegments(state)

    expect(segments.map(({ text: value }) => value)).toEqual([
      'A heading',
      'Read <t0>the bold</t0> and <t1>the <t2>docs</t2></t1> with <c3/><a4/>then stop.',
      'Outer item',
      'Inner item',
      'Uses &lt;angle&gt; &amp; ampersand',
    ])
  })

  it('rebuilds the same structure with the text replaced', () => {
    const result = applyTranslations(state, translateAll(state))
    const [heading, paragraph, image, list, numbers, escaped] = result.root.children!

    expect(heading.tag).toBe('h2')
    expect(heading.children![0].text).toBe('A HEADING')

    const [plain, bold, , anchor, , code, lineBreak, last] = paragraph.children!
    expect(plain.text).toBe('READ ')
    expect(bold).toMatchObject({ format: 1, text: 'THE BOLD' })
    expect(anchor).toMatchObject({ fields: link.fields, type: 'link' })
    expect(anchor.children![1]).toMatchObject({ format: 2, text: 'DOCS' })
    expect(code).toMatchObject({ format: 16, text: 'npm install' })
    expect(lineBreak.type).toBe('linebreak')
    expect(last.text).toBe('THEN STOP.')

    expect(image).toEqual(upload)
    expect(list.children![0].children![0].text).toBe('OUTER ITEM')
    expect(list.children![0].children![1].children![0].children![0].text).toBe('INNER ITEM')
    expect(numbers.children![0].text).toBe('2024')
    expect(escaped.children![0].text).toBe('USES <ANGLE> & AMPERSAND')
  })

  it('lets a translation reorder inline nodes', () => {
    const source: LexicalState = {
      root: block('root', [block('paragraph', [text('Red', 1), text(' car')])]),
    }

    const result = applyTranslations(source, { s0: 'car <t0>red</t0>' })

    expect(result.root.children![0].children).toMatchObject([
      { format: 0, text: 'car ' },
      { format: 1, text: 'red' },
    ])
  })

  it('does not change the original document', () => {
    const before = structuredClone(state)
    applyTranslations(state, translateAll(state))
    expect(state).toEqual(before)
  })

  describe('rejects damaged output', () => {
    const source: LexicalState = {
      root: block('root', [
        block('paragraph', [
          text('Bold', 1),
          text(' and '),
          block('link', [text('link')], link),
          text(' plus '),
          text('code', 16),
        ]),
      ]),
    }
    const valid = '<t0>Bold</t0> and <t1>link</t1> plus <c2/>'

    it.each([
      ['a missing tag', '<t0>Bold</t0> and link plus <c2/>'],
      ['an invented tag', `${valid} <t9>new</t9>`],
      ['a repeated tag', `${valid} <c2/>`],
      ['an unclosed tag', '<t0>Bold and <t1>link</t1> plus <c2/>'],
      ['crossed tags', '<t0>Bold <t1>link</t0></t1> <c2/>'],
      ['a tag nested in formatted text', '<t0>Bold <t1>link</t1></t0> <c2/>'],
      ['an empty formatted tag', '<t0></t0> and <t1>link</t1> plus <c2/>'],
      ['an empty link', '<t0>Bold</t0> and <t1></t1> plus <c2/>'],
      ['a self-closed text tag', '<t0/> and <t1>link</t1> plus <c2/>'],
      ['a paired code tag', '<t0>Bold</t0> and <t1>link</t1> plus <c2>code</c2>'],
      ['an empty translation', '   '],
    ])('%s', (_, translation) => {
      expect(() => applyTranslations(source, { s0: translation })).toThrow(InvalidTranslationError)
    })

    it('a missing segment', () => {
      expect(() => applyTranslations(source, {})).toThrow(InvalidTranslationError)
    })

    it('accepts the valid form', () => {
      expect(() => applyTranslations(source, { s0: valid })).not.toThrow()
    })
  })

  describe('hasContent', () => {
    it.each([
      ['nothing', null, false],
      ['an empty paragraph', { root: block('root', [block('paragraph', [])]) }, false],
      ['only spaces', { root: block('root', [block('paragraph', [text('  ')])]) }, false],
      ['a line break only', { root: block('root', [block('paragraph', [{ type: 'linebreak' }])]) }, false],
      ['text', { root: block('root', [block('paragraph', [text('Hi')])]) }, true],
      ['an upload', { root: block('root', [upload]) }, true],
    ])('%s', (_, value, expected) => {
      expect(hasContent(value as LexicalState | null)).toBe(expected)
    })
  })
})
