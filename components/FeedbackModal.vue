<script setup lang="ts">
import { computed, onScopeDispose, ref, shallowRef } from 'vue'
import {
  ExtensionAlert, ExtensionButton, ExtensionCheckbox, ExtensionFormField, ExtensionModal, ExtensionSelect, ExtensionTextarea,
  useExtensionApi, useExtensionI18n
} from '@gcs-ssc/extensions/ui'
import { categories, receiptSchema, submissionSchema } from '../feedback.ts'
import { messages } from '../i18n/messages.ts'

defineSlots<{ default: () => unknown }>()
const { agencyId } = defineProps<{ agencyId: string }>()
const { locale, t } = useExtensionI18n(messages)
const api = useExtensionApi('gcs-feedback')
const open = ref(false)
const category = ref<typeof categories[number]>()
const description = ref('')
const steps = ref('')
const blocked = ref(false)
const categoryOptions = computed(() => categories.map(value => ({ value, label: t(value) })))
const prompts = { bug: 'bugPrompt', confusing: 'confusingPrompt', suggestion: 'suggestionPrompt', positive: 'positivePrompt' } as const
const prompt = computed(() => category.value ? t(prompts[category.value]) : undefined)

type Submission = { kind: 'editing' | 'invalid' }
  | { kind: 'sending' | 'failed'; id: string }
  | { kind: 'sent'; id: string }
const state = shallowRef<Submission>({ kind: 'editing' })
let disposed = false
onScopeDispose(() => {
  disposed = true
})

const edit = () => {
  if (state.value.kind !== 'sending') state.value = { kind: 'editing' }
}

/**
 * Handles the shared modal trigger and dismissal.
 * @param next - Whether the modal should be open.
 */
const setOpen = (next: boolean) => {
  if (state.value.kind === 'sending') return
  if (state.value.kind === 'sent') state.value = { kind: 'editing' }
  open.value = next
}

/**
 * Creates a retry key even when the local app is served over HTTP.
 * @returns A random UUID for one report.
 */
const submissionId = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6]! & 15) | 64
  bytes[8] = (bytes[8]! & 63) | 128
  const hex = Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('')
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-')
}

/** Sends one report and preserves the draft and request ID for an unchanged retry. */
const submit = async () => {
  if (!open.value || state.value.kind === 'sending' || state.value.kind === 'sent') return
  const id = state.value.kind === 'failed' ? state.value.id : submissionId()
  const parsed = submissionSchema.safeParse({
    submissionId: id,
    locale: locale.value === 'fr' ? 'fr' : 'en',
    category: category.value,
    description: description.value,
    steps: steps.value,
    blocked: blocked.value
  })
  if (!parsed.success) {
    state.value = { kind: 'invalid' }
    return
  }
  state.value = { kind: 'sending', id }
  try {
    const receipt = receiptSchema.parse(await api.post(`/agencies/${encodeURIComponent(agencyId)}/reports`, parsed.data))
    if (receipt.id !== id) throw new Error('Invalid feedback receipt.')
    if (disposed) return
    category.value = undefined
    description.value = ''
    steps.value = ''
    blocked.value = false
    state.value = { kind: 'sent', id }
  } catch {
    if (!disposed) state.value = { kind: 'failed', id }
  }
}
</script>

<template>
  <ExtensionModal
    :open="open"
    :dismissible="state.kind !== 'sending'"
    :close="state.kind !== 'sending'"
    :title="t('giveFeedback')"
    :ui="{ content: 'sm:max-w-4xl' }"
    :description="t('privacy')"
    @update:open="setOpen">
    <slot />

    <template #body>
      <div v-if="state.kind === 'sent'" class="space-y-4">
        <ExtensionAlert
          role="status" color="success" variant="soft" icon="i-lucide-circle-check"
          :title="t('sent')" :description="t('receiptReference', { id: state.id })" />
        <div class="flex justify-end">
          <ExtensionButton @click="setOpen(false)">
            {{ t('done') }}
          </ExtensionButton>
        </div>
      </div>
      <form v-else class="space-y-4" data-field-scope="extension.gcs-feedback.report" @submit.prevent="submit">
        <ExtensionFormField :label="t('category')" name="category" required>
          <ExtensionSelect
            v-model="category" class="w-full" name="category" required :items="categoryOptions"
            :placeholder="t('chooseCategory')" :disabled="state.kind === 'sending'" @update:model-value="edit" />
        </ExtensionFormField>
        <ExtensionFormField :label="t('description')" :description="prompt" name="description" required>
          <ExtensionTextarea
            v-model="description" class="w-full" name="description" required :maxlength="2000"
            :rows="6" :disabled="state.kind === 'sending'" @update:model-value="edit" />
        </ExtensionFormField>
        <template v-if="category === 'bug'">
          <ExtensionFormField :label="t('steps')" name="steps" :required="false">
            <ExtensionTextarea
              v-model="steps" class="w-full" name="steps" :maxlength="2000"
              :rows="6" :disabled="state.kind === 'sending'" @update:model-value="edit" />
          </ExtensionFormField>
          <ExtensionCheckbox
            v-model="blocked" name="blocked" :required="false" :label="t('blocked')"
            :disabled="state.kind === 'sending'" @update:model-value="edit" />
        </template>
        <p v-if="state.kind === 'failed' || state.kind === 'invalid'" role="alert" class="text-sm text-error">
          {{ t(state.kind === 'failed' ? 'sendFailed' : 'invalid') }}
        </p>
        <div class="flex justify-end gap-2">
          <ExtensionButton type="button" color="neutral" variant="ghost" :disabled="state.kind === 'sending'" @click="setOpen(false)">
            {{ t('cancel') }}
          </ExtensionButton>
          <ExtensionButton type="submit" :loading="state.kind === 'sending'">
            {{ t('send') }}
          </ExtensionButton>
        </div>
      </form>
    </template>
  </ExtensionModal>
</template>
