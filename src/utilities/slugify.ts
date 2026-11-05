import { slugify as payloadSlugify } from 'payload/shared'

// Bulgarian Streamlined System, the official Bulgarian transliteration.
const bulgarianToLatin: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ж: 'zh',
  з: 'z',
  и: 'i',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'h',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'sht',
  ъ: 'a',
  ь: 'y',
  ю: 'yu',
  я: 'ya',
}

/**
 * Payload's default slugify strips non-Latin characters, which reduces a Bulgarian
 * title to nothing, so Cyrillic is transliterated first.
 */
export const slugify = (value: string): string =>
  payloadSlugify(
    value
      .toLowerCase()
      .replace(/[а-я]/g, (letter) => bulgarianToLatin[letter] ?? letter),
  ) ?? ''
