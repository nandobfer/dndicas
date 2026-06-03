"use client"

import type { Monster } from "../types/monsters.types"
import { DeleteNpcDialog } from "./delete-npc-dialog"

export function DeleteMonsterDialog(props: { isOpen: boolean; onClose: () => void; onConfirm: () => Promise<void>; monster: Monster | null; isDeleting?: boolean }) {
    return <DeleteNpcDialog {...props} entityLabel="Monstro" />
}
