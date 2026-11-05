import type { Endpoint, PayloadHandler, PayloadRequest } from 'payload'

import { Forbidden, NotFound } from 'payload'
import { z } from 'zod'

import {
  getTranslationStatus,
  translatePost,
  TranslationRequestError,
} from '@/translation/translatePost'

const bodySchema = z.object({
  overwrite: z.boolean().optional(),
  sourceLocale: z.string().optional(),
  targetLocale: z.string(),
})

const withErrors =
  (handler: (req: PayloadRequest, id: string) => Promise<Response>): PayloadHandler =>
  async (req) => {
    if (!req.user || req.user.collection !== 'users') {
      return Response.json({ error: 'You must be logged in.' }, { status: 401 })
    }

    try {
      return await handler(req, req.routeParams?.id as string)
    } catch (error) {
      if (error instanceof TranslationRequestError) {
        return Response.json({ error: error.message }, { status: error.status })
      }

      // Not found and not allowed look the same, so tenants' post IDs can't be probed.
      if (error instanceof NotFound || error instanceof Forbidden) {
        return Response.json({ error: 'Post not found.' }, { status: 404 })
      }

      throw error
    }
  }

export const translationStatusEndpoint: Endpoint = {
  handler: withErrors(async (req, id) =>
    Response.json(
      await getTranslationStatus({ id, payload: req.payload, user: req.user as never }),
    ),
  ),
  method: 'get',
  path: '/:id/translate',
}

export const translateEndpoint: Endpoint = {
  handler: withErrors(async (req, id) => {
    const body = bodySchema.safeParse(await req.json?.().catch(() => null))

    if (!body.success) {
      return Response.json({ error: 'Invalid request.' }, { status: 400 })
    }

    return Response.json(
      await translatePost({ ...body.data, id, payload: req.payload, user: req.user as never }),
    )
  }),
  method: 'post',
  path: '/:id/translate',
}
