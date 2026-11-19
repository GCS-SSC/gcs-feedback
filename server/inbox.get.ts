import { createGcsExtensionUserError, defineGcsExtensionRouteHandler } from '@gcs-ssc/extensions/server'
import { getQuery, isEvent } from 'h3'
import { Kysely, sql } from 'kysely'
import { z } from 'zod'
import { inboxSchema } from '../feedback.ts'

const positiveInt = z.string().regex(/^[1-9][0-9]{0,7}$/).transform(Number)
const paginationSchema = z.object({
  page: positiveInt.optional(),
  limit: positiveInt.refine(value => value <= 100).optional()
})

export default defineGcsExtensionRouteHandler(async ({ authorizedScope, db, event }) => {
  if (authorizedScope?.type !== 'global' || !(db instanceof Kysely) || !isEvent(event)) {
    throw new Error('Missing system feedback inbox context.')
  }
  const pagination = paginationSchema.safeParse(getQuery(event))
  if (!pagination.success) {
    throw createGcsExtensionUserError({
      code: 'GCS_FEEDBACK_PAGE_INVALID',
      message: { en: 'Invalid pagination.', fr: 'Pagination invalide.' }
    })
  }
  const { page = 1, limit = 10 } = pagination.data
  const { rows: [inbox] } = await sql<{ reports: unknown; total: string }>`
    WITH page AS (
      SELECT id, actor_id AS "actorId", category, description, steps, blocked, locale,
        to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "createdAt"
      FROM extensions.gcs_feedback_reports
      ORDER BY created_at DESC, id DESC, actor_id DESC
      LIMIT ${limit} OFFSET ${(page - 1) * limit}
    )
    SELECT
      coalesce(json_agg(page ORDER BY "createdAt" DESC, id DESC, "actorId" DESC), '[]'::json) AS reports,
      (SELECT count(*) FROM extensions.gcs_feedback_reports)::text AS total
    FROM page
  `.execute(db)
  return inboxSchema.parse({ reports: inbox?.reports, total: Number(inbox?.total) })
})
