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
  if (authorizedScope?.type !== 'agency' || !(db instanceof Kysely) || !isEvent(event)) {
    throw new Error('Missing agency feedback inbox context.')
  }
  const pagination = paginationSchema.safeParse(getQuery(event))
  if (!pagination.success) {
    throw createGcsExtensionUserError({
      code: 'GCS_FEEDBACK_PAGE_INVALID',
      message: { en: 'Invalid pagination.', fr: 'Pagination invalide.' }
    })
  }
  const { page = 1, limit = 10 } = pagination.data
  return await db.transaction().setIsolationLevel('repeatable read').execute(async trx => {
    const { rows } = await sql`
      SELECT id, actor_id AS "actorId", category, description, steps, blocked, locale,
        to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "createdAt"
      FROM extensions.gcs_feedback_reports
      WHERE agency_id = ${authorizedScope.agencyId}
      ORDER BY created_at DESC, id DESC, actor_id DESC
      LIMIT ${limit} OFFSET ${(page - 1) * limit}
    `.execute(trx)
    const count = await sql<{ total: string }>`
      SELECT count(*)::text AS total
      FROM extensions.gcs_feedback_reports
      WHERE agency_id = ${authorizedScope.agencyId}
    `.execute(trx)
    return inboxSchema.parse({ reports: rows, total: Number(count.rows[0]?.total) })
  })
})
