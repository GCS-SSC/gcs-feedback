import { defineGcsAuditOwnership, defineGcsExtension } from '@gcs-ssc/extensions'

const label = { en: 'Feedback', fr: 'Commentaires' }

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
    en: 'Collect and review feedback from signed-in users.',
    fr: 'Recueillir et examiner les commentaires des personnes connectées.'
  },
  configurationScope: 'system',
  requiredHostCapabilities: [
    'system-extensions', 'signed-in-sidebar-modal', 'extension-ui', 'extension-api-client', 'host-api-client',
    'server-handlers', 'server-handler-rbac', 'migrations', 'audit-ownership'
  ],
  auditOwnership: defineGcsAuditOwnership([
    { table: 'extensions.gcs_feedback_reports', owner: { kind: 'global', reason: 'Reports belong to the system Feedback inbox.' } }
  ]),
  admin: {
    systemWorkspace: { path: './components/FeedbackWorkspace.vue' }
  },
  migrations: [{ path: './server/migration.ts' }],
  serverHandlers: [
    {
      route: '/reports',
      method: 'post',
      path: './server/submit.post.ts',
      auth: 'manual'
    },
    {
      route: '/reports',
      method: 'get',
      path: './server/inbox.get.ts',
      rbac: { subject: 'system', action: 'delete', global: true }
    }
  ]
})
