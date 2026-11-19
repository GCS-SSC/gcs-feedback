import { defineGcsExtensionMigration } from '@gcs-ssc/extensions/server'
import { sql } from 'kysely'

export default defineGcsExtensionMigration({
  /**
   * Installs the report table and its agency inbox index.
   * @param db - The host migration database.
   */
  up: async db => {
    await db.schema.createTable('extensions.gcs_feedback_reports')
      .addColumn('id', 'uuid', column => column.notNull())
      .addColumn('agency_id', 'bigint', column => column.notNull().references('Agency_Profile.id').onDelete('restrict'))
      .addColumn('actor_id', 'text', column => column.notNull())
      .addColumn('category', 'text', column => column.notNull())
      .addColumn('description', 'text', column => column.notNull())
      .addColumn('steps', 'text', column => column.notNull())
      .addColumn('blocked', 'boolean', column => column.notNull())
      .addColumn('locale', 'text', column => column.notNull())
      .addColumn('created_at', 'timestamptz', column => column.notNull().defaultTo(sql`clock_timestamp()`))
      .addPrimaryKeyConstraint('gcs_feedback_reports_pk', ['agency_id', 'actor_id', 'id'])
      .addCheckConstraint('gcs_feedback_category', sql`category IN ('bug', 'confusing', 'suggestion', 'positive')`)
      .addCheckConstraint('gcs_feedback_locale', sql`locale IN ('en', 'fr')`)
      .addCheckConstraint('gcs_feedback_bug_fields', sql`category = 'bug' OR (steps = '' AND NOT blocked)`)
      .execute()
    await db.schema.createIndex('gcs_feedback_inbox_idx')
      .on('extensions.gcs_feedback_reports').columns(['agency_id', 'created_at', 'id']).execute()
  },
  down: async db => {
    await db.schema.dropTable('extensions.gcs_feedback_reports').execute()
  }
})
