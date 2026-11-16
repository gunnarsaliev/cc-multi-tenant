/**
 * Imports blog posts from a CSV export, one row per post.
 *
 *   pnpm blog:import "imports/Articles - Woman.csv" --tenant 5 --dry-run
 *   pnpm blog:import "imports/Articles - Woman.csv" --tenant 5
 *
 * Columns: Name (title), Slug, Post Body (HTML), Post Summary (meta description).
 *
 * Options:
 *   --tenant <id>   The tenant the posts belong to. Required.
 *   --locale <code> The locale the text is stored in. Defaults to `bg`.
 *   --publish       Publish the posts. Without it they are saved as drafts.
 *   --dry-run       Convert and report, but write nothing.
 *
 * A slug that already exists in the tenant is skipped, so the import can be run again.
 */
import config from '@payload-config'
import { convertHTMLToLexical, editorConfigFactory } from '@payloadcms/richtext-lexical'
import { JSDOM } from 'jsdom'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { getPayload, type RichTextField, type TypedLocale } from 'payload'

import { parseCsv } from '@/utilities/parseCsv'
import { slugify } from '@/utilities/slugify'

const META_DESCRIPTION_MAX = 200

const PLACEHOLDER_TEXT = /lorem ipsum|dolor sit amet|consectetur adipi|excepteur sint/i

/** Cuts at a word boundary and marks the cut, staying within `max` characters. */
const truncate = (value: string, max: number): string => {
  const text = value.replace(/\s+/g, ' ').trim()

  if (text.length <= max) {
    return text
  }

  const cut = text.slice(0, max - 1)
  const lastSpace = cut.lastIndexOf(' ')

  return `${(lastSpace > max / 2 ? cut.slice(0, lastSpace) : cut).replace(/[\s.,;:!?-]+$/, '')}…`
}

/** The post title is the page's only h1, so headings in the body start at h2. */
const prepareHtml = (html: string): string => html.replace(/<(\/?)h1(?=[\s>])/gi, '<$1h2')

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    'dry-run': { type: 'boolean', default: false },
    locale: { type: 'string', default: 'bg' },
    publish: { type: 'boolean', default: false },
    tenant: { type: 'string' },
  },
})

const [file] = positionals
const tenantID = Number(values.tenant)
const dryRun = values['dry-run']

if (!file || !Number.isInteger(tenantID)) {
  console.error('Usage: pnpm blog:import <file.csv> --tenant <id> [--locale bg] [--publish] [--dry-run]')
  process.exit(1)
}

const payload = await getPayload({ config, cron: false })
const locale = values.locale as TypedLocale

if (!payload.config.localization || !payload.config.localization.localeCodes.includes(locale)) {
  payload.logger.error(`Unknown locale "${locale}".`)
  process.exit(1)
}

const tenant = await payload.findByID({
  collection: 'tenants',
  depth: 0,
  disableErrors: true,
  id: tenantID,
})

if (!tenant) {
  payload.logger.error(`Tenant ${tenantID} does not exist.`)
  process.exit(1)
}

// Convert with the blog content field's own editor, so only nodes it supports are produced.
const contentField = payload.collections.blog.config.flattenedFields.find(
  (field) => field.name === 'content',
) as RichTextField
const editorConfig = editorConfigFactory.fromField({ field: contentField })

const rows = parseCsv(await readFile(path.resolve(process.cwd(), file), 'utf8'))
const totals = { created: 0, failed: 0, placeholder: 0, skipped: 0 }

payload.logger.info(
  `${dryRun ? '[dry run] ' : ''}Importing ${rows.length} rows into "${tenant.name}" (tenant ${tenantID}), locale "${locale}", as ${values.publish ? 'published' : 'draft'}.`,
)

for (const [index, row] of rows.entries()) {
  const title = row.Name?.trim()
  const body = row['Post Body']?.trim()
  const slug = slugify(row.Slug?.trim() || title || '')
  const label = `Row ${index + 2} (${slug || 'no slug'})`

  try {
    if (!title || !body || !slug) {
      throw new Error('The row needs a Name, a Slug and a Post Body.')
    }

    if (PLACEHOLDER_TEXT.test(`${title} ${body}`)) {
      totals.placeholder++
      payload.logger.warn(`${label}: placeholder text, skipped.`)
      continue
    }

    const existing = await payload.find({
      collection: 'blog',
      depth: 0,
      draft: true,
      limit: 1,
      where: { and: [{ tenant: { equals: tenantID } }, { slug: { equals: slug } }] },
    })

    if (existing.totalDocs > 0) {
      totals.skipped++
      payload.logger.info(`${label}: already exists, skipped.`)
      continue
    }

    const content = convertHTMLToLexical({ editorConfig, html: prepareHtml(body), JSDOM })

    if (content.root.children.length === 0) {
      throw new Error('The Post Body converted to nothing.')
    }

    const summary = row['Post Summary']?.trim()

    if (!dryRun) {
      await payload.create({
        collection: 'blog',
        data: {
          _status: values.publish ? 'published' : 'draft',
          content: content as never,
          meta: summary ? { description: truncate(summary, META_DESCRIPTION_MAX) } : undefined,
          slug,
          tenant: tenantID,
          title,
        },
        draft: !values.publish,
        locale,
      })
    }

    totals.created++
    payload.logger.info(`${label}: ${dryRun ? 'would be created' : 'created'}.`)
  } catch (error) {
    totals.failed++
    payload.logger.error({ err: error, msg: `${label}: failed.` })
  }
}

payload.logger.info(`${dryRun ? '[dry run] ' : ''}Blog import finished: ${JSON.stringify(totals)}`)
process.exit(totals.failed > 0 ? 1 : 0)
