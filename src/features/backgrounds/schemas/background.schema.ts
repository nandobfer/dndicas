import { z } from "zod"

export const backgroundSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  description: z.string().min(1, "Descrição é obrigatória"),
  image: z.string().optional(),
  status: z.enum(["active", "inactive"]),
  suggestedAttributes: z.array(z.string()).optional(),
  skillProficiencies: z.array(z.string()).optional(),
  toolProficiencies: z.array(z.string()).optional(),
  languages: z.array(z.string()).optional(),
  equipment: z.array(z.string()).optional(),
  traits: z.array(z.object({
    name: z.string().min(1, "Nome da habilidade é obrigatório"),
    level: z.number().min(1),
    description: z.string().min(1, "Descrição é obrigatória")
  })).optional()
})

export type BackgroundFormValues = z.infer<typeof backgroundSchema>
