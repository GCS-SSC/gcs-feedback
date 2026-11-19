import { z } from 'zod'

type Source = 'audit' | 'access'

const auditFields = z.object({
  id: z.string(),
  created_at: z.iso.datetime(),
  actor_user_id: z.string().nullable(),
  request_id: z.string().nullable(),
  scope_type: z.string(),
  agency_id: z.string().nullable(),
  agency_ids: z.array(z.string())
})
const summarySchema = auditFields.extend({
  kind: z.enum(['change', 'security', 'access']),
  operation: z.string(),
  table_name: z.string().nullable()
})
const listSchema = z.object({ items: z.array(summarySchema).max(50) })
const detailSchema = z.looseObject(auditFields.shape).extend({
  input_visibility: z.enum(['captured', 'unavailable', 'restricted'])
})
const accessId = z.uuid()

type TraceReport = { actorId: string; createdAt: string }
type AuditFields = z.infer<typeof auditFields>
type Summary = z.infer<typeof summarySchema>
type HostGet = (path: string, options?: {
  query?: Record<string, string | number>
  signal?: AbortSignal
}) => Promise<unknown>

export type TraceRecord = {
  id: string
  kind: Summary['kind']
  createdAt: string
  operation: string
  tableName: string | null
  requestId: string | null
}
export type TraceSource = { kind: 'ready'; records: TraceRecord[] } | { kind: 'unavailable' }
export type FeedbackTrace = Record<Source, TraceSource>

/**
 * Accepts only system events attributed to the reporter in the report window.
 * @param row - The candidate event.
 * @param report - The verified reporter and submission timestamp.
 * @param from - Start of the window in milliseconds.
 * @param to - End of the window in milliseconds.
 * @returns Whether the event belongs in the report’s trace.
 */
const ownsRecord = (row: AuditFields, report: TraceReport, from: number, to: number) => {
  const timestamp = Date.parse(row.created_at)
  return row.actor_user_id === report.actorId && timestamp >= from && timestamp <= to
    && row.scope_type === 'global'
    && row.agency_id === null
    && row.agency_ids.length === 0
}

/**
 * Builds a host detail path only from a valid ID for the source.
 * @param row - The candidate event.
 * @param source - The host history source.
 * @returns A detail URL, or null for an invalid candidate.
 */
const detailPath = (row: Summary, source: Source) => {
  if (source === 'access') {
    return row.kind === 'access' && accessId.safeParse(row.id).success
      ? '/api/admin/audit/access/' + row.id
      : null
  }
  return row.kind !== 'access' && /^[1-9][0-9]{0,18}$/.test(row.id)
    ? '/api/admin/audit/events/' + row.kind + '/' + row.id
    : null
}

const containsRedaction = (evidence: unknown) =>
  /\[redacted\b|"state"\s*:\s*"(?:restricted|redacted)"|"redacted"\s*:\s*true/i.test(JSON.stringify(evidence))

const capturedInputs = z.looseObject({})

/**
 * Checks event-level redaction and evidence outside the SQL fields omitted from every trace.
 * @param evidence - The host detail response with a validated event identity.
 * @returns Whether the trace must omit the event.
 */
const hasRestrictedEvidence = (evidence: z.infer<typeof detailSchema>) => {
  if (evidence.input_visibility === 'restricted') return true
  const fields = Object.fromEntries(Object.entries(evidence).filter(([key]) => key !== 'sql' && key !== 'inputs'))
  const inputs = capturedInputs.safeParse(evidence.inputs)
  fields.inputs = inputs.success
    ? Object.fromEntries(Object.entries(inputs.data).filter(([key]) => key !== 'sql'))
    : evidence.inputs
  return containsRedaction(fields)
}

/**
 * Checks redaction before projecting a bounded set of timeline entries.
 * @param get - The host API client using the reviewer’s session.
 * @param source - The host history source.
 * @param report - The verified reporter and submission timestamp.
 * @param from - Start of the window in milliseconds.
 * @param to - End of the window in milliseconds.
 * @param signal - Cancellation for the current report selection.
 * @returns Visible summaries or the unavailable state.
 */
const loadSource = async (
  get: HostGet, source: Source, report: TraceReport, from: number, to: number, signal?: AbortSignal
): Promise<TraceSource> => {
  const endpoint = source === 'audit' ? '/api/admin/audit/events' : '/api/admin/audit/access'
  try {
    const query = { actor: report.actorId, from: new Date(from).toISOString(), to: new Date(to).toISOString(), limit: 50 }
    const { items } = listSchema.parse(await get(endpoint, { query, signal }))
    const candidates = items.filter(row => ownsRecord(row, report, from, to))
      .sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at))
    const records: TraceRecord[] = []

    // The list endpoints don't expose redaction status. Inspect a bounded page
    // of details and project only the timeline fields into the rendered view.
    for (let offset = 0; offset < candidates.length && records.length < 10; offset += 10) {
      const confirmed = await Promise.all(candidates.slice(offset, offset + 10).map(async row => {
        const path = detailPath(row, source)
        if (!path || containsRedaction(row)) return null
        const detail = await get(path, { signal })
        const evidence = detailSchema.parse(detail)
        if (evidence.id !== row.id || !ownsRecord(evidence, report, from, to)
          || hasRestrictedEvidence(evidence)) return null
        return {
          id: row.id,
          kind: row.kind,
          createdAt: row.created_at,
          operation: row.operation,
          tableName: row.table_name,
          requestId: row.request_id
        }
      }))
      for (const entry of confirmed) {
        if (entry && records.length < 10) records.push(entry)
      }
    }
    return { kind: 'ready', records }
  } catch {
    return { kind: 'unavailable' }
  }
}

/**
 * Loads audit and access history independently so either source can be unavailable.
 * @param get - The host API client using the reviewer’s session.
 * @param report - The verified reporter and submission timestamp.
 * @param signal - Cancellation for the current report selection.
 * @returns The result for each history source.
 */
export const loadFeedbackTrace = async (
  get: HostGet, report: TraceReport, signal?: AbortSignal
): Promise<FeedbackTrace> => {
  const to = Date.parse(report.createdAt)
  const from = to - 30 * 60 * 1000
  const [audit, access] = await Promise.all([
    loadSource(get, 'audit', report, from, to, signal),
    loadSource(get, 'access', report, from, to, signal)
  ])
  return { audit, access }
}
