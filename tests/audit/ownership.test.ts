import extension from '../../extension.config.ts'

const { verifyExtensionAuditContract } = await import(new URL(
  '../../../../tooling/gcs-ssc/tests/fixtures/extension-audit-contract.ts', import.meta.url
).href)

verifyExtensionAuditContract(extension, [
  {
    table: 'extensions.gcs_feedback_reports',
    row: { id: '0c3bd552-ded8-481c-815f-057ccbe852d8', agency_id: '11', actor_id: '7' },
    agencies: ['11']
  },
  {
    table: 'extensions.gcs_feedback_reports',
    row: { id: '2936d485-2bab-41ff-b6ab-5419b2aaaf85', agency_id: '22', actor_id: '7' },
    agencies: ['22']
  }
])
