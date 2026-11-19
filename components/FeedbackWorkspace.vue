<script setup lang="ts">
import { computed, onScopeDispose, ref, shallowRef, watch } from 'vue'
import {
  ExtensionBadge, ExtensionButton, ExtensionModal, ExtensionResourceLayout,
  useExtensionApi, useExtensionI18n, useHostApi
} from '@gcs-ssc/extensions/ui'
import { inboxSchema } from '../feedback.ts'
import type { FeedbackReport } from '../feedback.ts'
import { messages } from '../i18n/messages.ts'
import { loadFeedbackTrace } from '../trace.ts'

const { agencyId, section, readOnly = true } = defineProps<{
  agencyId: string
  section?: string
  readOnly?: boolean
}>()

const { locale, t } = useExtensionI18n(messages)
const api = useExtensionApi('gcs-feedback')
const hostApi = useHostApi()
const endpoint = () => `/agencies/${encodeURIComponent(agencyId)}/reports`
const dateText = (date: string) => new Date(date).toLocaleString(locale.value)

const pagination = ref({ pageIndex: 0, pageSize: 10 })
const columns = computed(() => [
  { id: 'category', header: t('category') },
  { id: 'description', header: t('description') },
  { id: 'submitted', header: t('submitted') },
  { id: 'actions', header: t('actions') }
])

type InboxPage = { kind: 'loading' | 'failed' | 'ready'; reports: FeedbackReport[]; total: number }
type Trace = Awaited<ReturnType<typeof loadFeedbackTrace>>
type Review = { report: FeedbackReport; kind: 'loading' }
  | { report: FeedbackReport; kind: 'ready'; evidence: Trace }
const inbox = shallowRef<InboxPage>({ kind: 'loading', reports: [], total: 0 })
const review = shallowRef<Review>()
let traceRequest: AbortController | undefined
const clearReview = () => {
  traceRequest?.abort()
  review.value = undefined
}
let reportTrigger: HTMLElement | undefined
const inboxHeading = ref<HTMLElement>()
/**
 * Loads one page for the current agency and applies it only while that request owns the inbox.
 */
const loadInbox = async () => {
  if (readOnly || section !== 'feedback') return
  const { pageIndex, pageSize } = pagination.value
  const pending: InboxPage = { ...inbox.value, kind: 'loading' }
  inbox.value = pending
  try {
    const response = inboxSchema.parse(await api.get(endpoint(), { query: { page: pageIndex + 1, limit: pageSize } }))
    if (inbox.value === pending) inbox.value = { kind: 'ready', ...response }
  } catch {
    if (inbox.value === pending) inbox.value = { ...pending, kind: 'failed' }
  }
}

/**
 * Opens a report and starts the trace lookup under the reviewer’s audit permissions.
 * @param report - The selected report from the current agency inbox.
 * @param event - Activation event from the report row action.
 */
const openReport = async (report: FeedbackReport, event: MouseEvent) => {
  if (readOnly || section !== 'feedback') return
  clearReview()
  reportTrigger = event.currentTarget instanceof HTMLElement ? event.currentTarget : undefined
  const request = new AbortController()
  traceRequest = request
  const pending: Review = { report, kind: 'loading' }
  review.value = pending
  const scope = { agencyId, actorId: report.actorId, createdAt: report.createdAt }
  const evidence = await loadFeedbackTrace((path, options) => hostApi.get(path, options), scope, request.signal)
  if (traceRequest === request) traceRequest = undefined
  if (review.value === pending) review.value = { report, kind: 'ready', evidence }
}

/** Returns focus to the row action once the modal has finished closing. */
const restoreReportFocus = () => {
  if (review.value) return
  const target = reportTrigger?.isConnected ? reportTrigger : inboxHeading.value
  reportTrigger = undefined
  target?.focus()
}

watch([() => agencyId, () => section, () => readOnly], () => {
  clearReview()
  inbox.value = { kind: 'loading', reports: [], total: 0 }
  pagination.value.pageIndex = 0
  void loadInbox()
}, { immediate: true, flush: 'sync' })

watch(() => [pagination.value.pageIndex, pagination.value.pageSize], () => {
  void loadInbox()
})

onScopeDispose(() => {
  clearReview()
  inbox.value = { kind: 'loading', reports: [], total: 0 }
})
</script>

<template>
  <p v-if="section !== 'feedback'" class="text-muted">
    {{ t('setup') }}
  </p>
  <p v-else-if="readOnly" class="text-muted">
    {{ t('inboxRestricted') }}
  </p>
  <div v-else>
    <section class="space-y-3">
      <h2 ref="inboxHeading" tabindex="-1" class="text-lg font-semibold">
        {{ t('inbox') }}
      </h2>
      <ExtensionModal
        :open="Boolean(review)"
        :title="t('viewReport')"
        :ui="{ content: 'sm:max-w-4xl' }"
        :description="review ? t(review.report.category) : undefined"
        @update:open="!$event && clearReview()"
        @after:leave="restoreReportFocus">
        <template #body>
          <div v-if="review" class="space-y-3">
            <dl class="space-y-1 text-sm">
              <div>
                <dt class="inline font-medium">
                  {{ t('reference') }}
                </dt><dd class="inline break-all">
                  {{ review.report.id }}
                </dd>
              </div>
              <div>
                <dt class="inline font-medium">
                  {{ t('reporter') }}
                </dt><dd class="inline break-all">
                  {{ review.report.actorId }}
                </dd>
              </div>
              <div>
                <dt class="inline font-medium">
                  {{ t('submitted') }}
                </dt><dd class="inline">
                  {{ dateText(review.report.createdAt) }}
                </dd>
              </div>
            </dl>
            <p v-if="review.report.blocked" class="text-sm text-error">
              {{ t('blocked') }}
            </p>
            <p class="whitespace-pre-wrap break-words">
              {{ review.report.description }}
            </p>
            <template v-if="review.report.steps">
              <h4 class="font-medium">
                {{ t('steps') }}
              </h4>
              <p class="whitespace-pre-wrap break-words">
                {{ review.report.steps }}
              </p>
            </template>
            <h4 class="font-semibold">
              {{ t('recent') }}
            </h4>
            <p class="text-sm text-muted">
              {{ t('traceWindow') }}
            </p>
            <p v-if="review.kind === 'loading'" role="status">
              {{ t('loading') }}
            </p>
            <template v-else>
              <div v-for="source of (['audit', 'access'] as const)" :key="source" class="space-y-1">
                <h5 class="font-medium">
                  {{ t(source) }}
                </h5>
                <p v-if="review.evidence[source].kind === 'unavailable'" class="text-sm text-muted">
                  {{ t('traceUnavailable') }}
                </p>
                <template v-else>
                  <p v-if="!review.evidence[source].records.length" class="text-sm text-muted">
                    {{ t('traceEmpty') }}
                  </p>
                  <ul v-else class="list-disc space-y-1 ps-5 text-sm">
                    <li v-for="record in review.evidence[source].records" :key="`${record.kind}:${record.id}`">
                      <time :datetime="record.createdAt">{{ dateText(record.createdAt) }}</time> · {{ record.operation }}
                      <span v-if="record.tableName"> · {{ record.tableName }}</span>
                      <span v-if="record.requestId" class="break-all text-muted"> · {{ t('request') }} {{ record.requestId }}</span>
                    </li>
                  </ul>
                </template>
              </div>
            </template>
          </div>
        </template>
      </ExtensionModal>
      <ExtensionResourceLayout
        v-model:pagination="pagination"
        :data="inbox.reports"
        :columns="columns"
        :total-records="inbox.total"
        :loading="inbox.kind === 'loading'"
        :request-status="inbox.kind === 'loading' ? 'pending' : inbox.kind === 'failed' ? 'error' : 'success'"
        :show-toolbar="false"
        @retry="loadInbox">
        <template #category-cell="{ row }">
          <div class="flex flex-wrap items-center gap-2">
            <span>{{ t(row.original.category) }}</span>
            <ExtensionBadge v-if="row.original.blocked" color="error" variant="subtle" :label="t('blockedReport')" />
          </div>
        </template>
        <template #description-cell="{ row }">
          <p class="line-clamp-2 max-w-lg whitespace-pre-wrap break-words">
            {{ row.original.description }}
          </p>
        </template>
        <template #submitted-cell="{ row }">
          <time :datetime="row.original.createdAt">{{ dateText(row.original.createdAt) }}</time>
        </template>
        <template #actions-cell="{ row }">
          <div class="flex justify-end">
            <ExtensionButton
              icon="i-lucide-eye" color="neutral" variant="ghost" :aria-label="t('viewReport')"
              @click="openReport(row.original, $event)" />
          </div>
        </template>
      </ExtensionResourceLayout>
    </section>
  </div>
</template>
