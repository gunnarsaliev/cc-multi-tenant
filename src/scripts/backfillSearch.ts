import config from '@payload-config'
import { getPayload } from 'payload'

import { indexAllDocuments } from '@/search/indexDocument'

const payload = await getPayload({ config, cron: false })
const totals = await indexAllDocuments(payload)

payload.logger.info(`Search backfill finished: ${JSON.stringify(totals)}`)
process.exit(0)
