import config from '@payload-config'
import { getPayload } from 'payload'
const payload = await getPayload({ config, cron: false })
const res = await payload.find({ collection: 'blog', depth: 0, draft: true, limit: 300, locale: 'en', sort: 'id', where: { and: [{ tenant: { equals: 2 } }, { _status: { equals: 'draft' } }, { createdAt: { greater_than_equal: '2026-11-16T12:09:00.000Z' } }, { createdAt: { less_than_equal: '2026-11-16T12:11:00.000Z' } }] } })
console.log('RESULT candidates', res.totalDocs)
if (res.totalDocs !== 76) { console.log('RESULT abort: expected 76'); process.exit(1) }
let moved = 0
for (const d of res.docs as any[]) {
  try { await payload.update({ collection: 'blog', id: d.id, locale: 'en', draft: true, data: { tenant: 6 } }); moved++ }
  catch (e: any) { console.log('RESULT fail', d.id, d.slug, e.message) }
}
for (const t of [2, 6]) {
  const all = await payload.find({ collection: 'blog', depth: 0, draft: true, limit: 1, where: { tenant: { equals: t } } })
  const dr = await payload.find({ collection: 'blog', depth: 0, draft: true, limit: 1, where: { and: [{ tenant: { equals: t } }, { _status: { equals: 'draft' } }] } })
  console.log('RESULT tenant', t, 'total', all.totalDocs, 'drafts', dr.totalDocs)
}
console.log('RESULT moved', moved)
process.exit(0)
