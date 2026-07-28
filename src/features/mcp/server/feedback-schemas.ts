import { z } from "zod"

export const feedbackStatusSchema = z.enum(["pendente", "concluido", "cancelado"])
export const feedbackPrioritySchema = z.enum(["baixa", "media", "alta"])
export const feedbackTypeSchema = z.enum(["bug", "melhoria"])

export const listFeedbacksSchema = z.object({
    search: z.string().trim().optional().default(""),
    status: feedbackStatusSchema.or(z.literal("all")).optional(),
    priority: feedbackPrioritySchema.or(z.literal("all")).optional(),
    type: feedbackTypeSchema.or(z.literal("all")).optional(),
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(50).optional().default(20),
})

export const feedbackIdSchema = z.object({
    id: z.string().trim().min(1, "ID do feedback é obrigatório"),
})

export const createFeedbackSchema = z.object({
    title: z.string().trim().min(3).max(200),
    description: z.string().trim().min(10).max(50000),
    type: feedbackTypeSchema,
    status: feedbackStatusSchema.optional(),
    priority: feedbackPrioritySchema.optional(),
})

export const updateFeedbackSchema = feedbackIdSchema.extend({
    title: z.string().trim().min(3).max(200).optional(),
    description: z.string().trim().min(10).max(50000).optional(),
    type: feedbackTypeSchema.optional(),
    status: feedbackStatusSchema.optional(),
    priority: feedbackPrioritySchema.optional(),
})

export const commentFeedbackSchema = feedbackIdSchema.extend({
    message: z.string().trim().min(1, "Comentário é obrigatório").max(50000, "Comentário muito longo"),
})

export const requestFeedbackAgentSchema = feedbackIdSchema.extend({
    model: z.string().trim().min(1, "Modelo é obrigatório"),
    message: z.string().trim().max(20000).optional(),
})

export const requestFeedbackIterationSchema = feedbackIdSchema.extend({
    model: z.string().trim().min(1, "Modelo é obrigatório"),
    message: z.string().trim().min(1, "Mensagem é obrigatória").max(20000),
})

export type ListFeedbacksInput = z.infer<typeof listFeedbacksSchema>
export type FeedbackIdInput = z.infer<typeof feedbackIdSchema>
export type CreateFeedbackInput = z.infer<typeof createFeedbackSchema>
export type UpdateFeedbackInput = z.infer<typeof updateFeedbackSchema>
export type CommentFeedbackInput = z.infer<typeof commentFeedbackSchema>
export type RequestFeedbackAgentInput = z.infer<typeof requestFeedbackAgentSchema>
export type RequestFeedbackIterationInput = z.infer<typeof requestFeedbackIterationSchema>
