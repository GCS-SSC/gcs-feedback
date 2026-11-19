import { defineGcsAuditOwnership, defineGcsExtension } from '@gcs-ssc/extensions'

const label = { en: 'Feedback', fr: 'Commentaires' }
const agency = { param: 'agencyId' }

export default defineGcsExtension({
  key: 'gcs-feedback',
  sdkVersion: '^0.4.0',
  name: label,
  signedInSidebarModal: {
    label: { en: 'Give feedback', fr: 'Donner des commentaires' },
    icon: 'i-lucide-message-square',
    path: './components/FeedbackModal.vue'
  },
  description: {
    en: 'Collect and review feedback from agency testers.',
    fr: 'Recueillir et examiner les commentaires des personnes qui testent l’application.'
  },
  configurationScope: 'agency',
  configurationAccess: 'manager',
  requiredHostCapabilities: [
    'agency-only-configuration', 'configuration-access', 'agency-config', 'agency-workspace',
    'agency-workspace-navigation', 'signed-in-sidebar-modal', 'extension-ui', 'extension-api-client', 'host-api-client',
    'server-handlers', 'server-handler-rbac', 'migrations', 'audit-ownership'
  ],
  auditOwnership: defineGcsAuditOwnership([
    { table: 'extensions.gcs_feedback_reports', owner: { kind: 'owner', owner: 'agency', column: 'agency_id' } }
  ]),
  admin: {
    agency: { path: './components/FeedbackWorkspace.vue' },
    agencyWorkspace: {
      label,
      icon: 'i-lucide-message-square',
      navigation: { category: 'management', order: 90 },
      tabs: [{ id: 'feedback', label }]
    }
  },
  migrations: [{ path: './server/migration.ts' }],
  serverHandlers: [
    {
      route: '/agencies/[agencyId]/reports',
      method: 'post',
      path: './server/submit.post.ts',
      auth: 'manual'
    },
    {
      route: '/agencies/[agencyId]/reports',
      method: 'get',
      path: './server/inbox.get.ts',
      rbac: { subject: 'agency', action: 'delete', agency }
    }
  ]
})
