"use client"

import { toast } from "sonner"
import { useCreateNpc, useUpdateNpc } from "../api/npcs-queries"
import type { Monster, UpdateMonsterInput } from "../types/monsters.types"
import { getMonsterXp } from "../utils/monster-calculations"
import { NpcFormModal } from "./npc-form-modal"
import type { CreateMonsterSchema } from "../api/validation"

export function UserNpcFormModal({ npc, isOpen, onClose, onSuccess }: { npc: Monster | null; isOpen: boolean; onClose: () => void; onSuccess: () => void }) {
    const createMutation = useCreateNpc()
    const updateMutation = useUpdateNpc()
    const isSubmitting = createMutation.isPending || updateMutation.isPending

    const handleSave = async (data: CreateMonsterSchema, npcId?: string) => {
        const cleaned = { ...data, experience: getMonsterXp(data.challengeRating, data.experienceOverride) }
        if (npcId) {
            await updateMutation.mutateAsync({ id: npcId, data: cleaned as UpdateMonsterInput })
            toast.success("NPC atualizado com sucesso!")
        } else {
            await createMutation.mutateAsync(cleaned as any)
            toast.success("NPC criado com sucesso!")
        }
        onSuccess()
    }

    return (
        <NpcFormModal
            npc={npc}
            isOpen={isOpen}
            onClose={onClose}
            onSave={handleSave}
            isSubmitting={isSubmitting}
            title="Novo NPC"
            editTitle={(name) => `Editar ${name}`}
            subtitle="Crie um NPC vinculado à sua conta"
            editSubtitle="Atualize as informações do NPC"
            entityLabel="NPC"
            createLabel="Criar NPC"
            editLabel="Salvar Alterações"
            sourceDefault="Homebrew"
        />
    )
}
