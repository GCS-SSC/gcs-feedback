import { z } from 'zod'

export const categories = ['bug', 'confusing', 'suggestion', 'positive'] as const
const text = z.string().trim().max(2000).refine(value => !value.includes('\u0000'))
const description = text.refine(value => value.length > 0)
const common = {
  submissionId: z.uuid(),
  description,
  locale: z.enum(['en', 'fr'])
}

export const submissionSchema = z.discriminatedUnion('category', [
  z.object({ ...common, category: z.literal('bug'), steps: text, blocked: z.boolean() }),
  z.object({ ...common, category: z.enum(['confusing', 'suggestion', 'positive']) })
])

export const receiptSchema = z.object({ id: z.uuid() })
export const reportSchema = receiptSchema.extend({
  category: z.enum(categories),
  description: z.string(),
  steps: z.string(),
  blocked: z.boolean(),
  actorId: z.string(),
  createdAt: z.iso.datetime(),
  locale: z.enum(['en', 'fr'])
})

export const inboxSchema = z.object({
  reports: z.array(reportSchema),
  total: z.number().int().nonnegative()
})

export type FeedbackReport = z.infer<typeof reportSchema>
