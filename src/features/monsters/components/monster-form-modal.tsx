"use client"

import { toast } from "sonner"
import { useCreateMonster, useUpdateMonster } from "../api/monsters-queries"
import type { Monster, UpdateMonsterInput } from "../types/monsters.types"
import { getMonsterXp } from "../utils/monster-calculations"
import { NpcFormModal } from "./npc-form-modal"
import type { CreateMonsterSchema } from "../api/validation"

export function MonsterFormModal({ monster, isOpen, onClose, onSuccess }: { monster: Monster | null; isOpen: boolean; onClose: () => void; onSuccess: () => void }) {
    const createMutation = useCreateMonster()
    const updateMutation = useUpdateMonster()
    const isSubmitting = createMutation.isPending || updateMutation.isPending

    const handleSave = async (data: CreateMonsterSchema, npcId?: string) => {
        const cleaned = { ...data, experience: getMonsterXp(data.challengeRating, data.experienceOverride) }
        if (npcId) {
            await updateMutation.mutateAsync({ id: npcId, data: cleaned as UpdateMonsterInput })
            toast.success("Monstro atualizado com sucesso!")
        } else {
            await createMutation.mutateAsync(cleaned as any)
            toast.success("Monstro criado com sucesso!")
        }
        onSuccess()
    }

    return (
        <NpcFormModal
            npc={monster}
            isOpen={isOpen}
            onClose={onClose}
            onSave={handleSave}
            isSubmitting={isSubmitting}
            title="Novo Monstro"
            editTitle={(name) => `Editar ${name}`}
            subtitle="Crie uma nova criatura no catálogo"
            editSubtitle="Atualize as informações do monstro"
            entityLabel="Monstro"
            createLabel="Criar Monstro"
            editLabel="Salvar Alterações"
            sourceDefault="LDM pág. "
        />
    )
}
