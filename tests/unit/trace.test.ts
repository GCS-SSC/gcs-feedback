import { expect, test } from 'vitest'
import { loadFeedbackTrace } from '../../trace'

const events = '/api/admin/audit/events'
const access = '/api/admin/audit/access'
const report = { agencyId: '4', actorId: 'tester', createdAt: '2026-11-19T16:00:00.000Z' }
const sourceRow = {
  id: '1',
  kind: 'change',
  operation: 'UPDATE',
  table_name: 'Agreement',
  created_at: '2026-11-19T15:58:00.000Z',
  actor_user_id: 'tester',
  request_id: 'request-1',
  scope_type: 'agency',
  agency_id: '4',
  agency_ids: ['4']
}

test('filters actor, time, agency and redaction before exposing trace metadata', async () => {
  const restricted = { ...sourceRow, id: '2' }
  const redacted = { ...sourceRow, id: '3' }
  const otherItems = [
    { ...sourceRow, id: '4', agency_ids: ['4', '5'] },
    { ...sourceRow, id: '5', actor_user_id: 'other' },
    { ...sourceRow, id: '6', created_at: '2026-11-19T16:00:01.000Z' },
    { ...sourceRow, id: '7', created_at: '2026-11-19T15:29:59.000Z' },
    { ...sourceRow, id: '8', scope_type: 'global' },
    { ...sourceRow, id: '9', agency_id: '5', agency_ids: ['5'] }
  ]
  const calls: string[] = []
  const result = await loadFeedbackTrace(async (path, options) => {
    calls.push(path)
    if (path === events || path === access) {
      expect(options?.query).toEqual({
        actor: 'tester', from: '2026-11-19T15:30:00.000Z', to: report.createdAt, limit: 50
      })
    }
    switch (path) {
      case events: return { items: [sourceRow, restricted, redacted, ...otherItems] }
      case access: throw new Error('access history unavailable')
      case events + '/change/1':
        return { ...sourceRow, input_visibility: 'captured', inputs: { body: 'never shown', sql: ['[REDACTED]'] } }
      case events + '/change/2': return { ...restricted, input_visibility: 'restricted' }
      case events + '/change/3':
        return { ...redacted, input_visibility: 'captured', inputs: { password: '[REDACTED]' } }
      default: throw new Error('Unexpected request ' + path)
    }
  }, report)

  expect(result).toEqual({
    audit: { kind: 'ready', records: [{
      id: '1', kind: 'change', createdAt: sourceRow.created_at, operation: 'UPDATE', tableName: 'Agreement', requestId: 'request-1'
    }] },
    access: { kind: 'unavailable' }
  })
  expect(calls.sort()).toEqual([access, events, events + '/change/1', events + '/change/2', events + '/change/3'])
})

test('keeps ten newest eligible rows and omits restricted access events', async () => {
  const rows = Array.from({ length: 12 }, (_, index) => ({
    ...sourceRow, id: String(index + 1), created_at: new Date(Date.parse(report.createdAt) - index * 1000).toISOString()
  }))
  const restrictedAccess = { ...sourceRow, kind: 'access', id: '46cc8fa8-3c92-4fb4-929e-e92fbfa12f46' }
  const visibleAccess = { ...restrictedAccess, id: '81c0d59a-b660-4600-ac43-56c6675c6674' }
  const result = await loadFeedbackTrace(async path => {
    if (path === events) return { items: [...rows].reverse() }
    if (path === access) return { items: [restrictedAccess, visibleAccess] }
    if (path === access + '/' + restrictedAccess.id) {
      return { ...restrictedAccess, input_visibility: 'unavailable', inputs: { state: 'restricted' } }
    }
    if (path === access + '/' + visibleAccess.id) {
      return { ...visibleAccess, input_visibility: 'unavailable', sql: 'SELECT [REDACTED]', limitations: ['parameters_redacted'] }
    }
    return { ...rows.find(row => path.endsWith('/' + row.id)), input_visibility: 'captured' }
  }, report)

  expect(result.audit.kind).toBe('ready')
  if (result.audit.kind === 'ready') expect(result.audit.records.map(row => row.id)).toEqual(rows.slice(0, 10).map(row => row.id))
  expect(result.access).toEqual({ kind: 'ready', records: [{
    id: visibleAccess.id, kind: 'access', createdAt: sourceRow.created_at, operation: 'UPDATE', tableName: 'Agreement', requestId: 'request-1'
  }] })
})
