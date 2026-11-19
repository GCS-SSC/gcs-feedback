import { createGcsExtensionUserError, defineGcsExtensionRouteHandler } from '@gcs-ssc/extensions/server'
import { Kysely, sql } from 'kysely'
import { submissionSchema } from '../feedback.ts'

export default defineGcsExtensionRouteHandler(async context => {
  const { auth, db } = context
  if (!auth || !(db instanceof Kysely)) {
    throw new Error('Missing feedback submission context.')
  }
  const parsed = submissionSchema.safeParse(await context.readBody())
  if (!parsed.success) {
    throw createGcsExtensionUserError({
      code: 'GCS_FEEDBACK_INVALID',
      message: { en: 'Check the category and description.', fr: 'Vérifiez la catégorie et la description.' }
    })
  }
  const input = parsed.data
  await sql`
    INSERT INTO extensions.gcs_feedback_reports
      (id, actor_id, category, description, steps, blocked, locale)
    VALUES (
      ${input.submissionId}, ${auth.userId}, ${input.category},
      ${input.description}, ${input.category === 'bug' ? input.steps : ''},
      ${input.category === 'bug' && input.blocked}, ${input.locale}
    )
    ON CONFLICT (actor_id, id) DO NOTHING
  `.execute(db)
  return { id: input.submissionId }
})
