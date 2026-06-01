"use client"

import type { Monster } from "../types/monsters.types"
import { NpcPreview } from "./npc-preview"

export function MonsterPreview({ monster, showStatus = true, hideStatusChip = false, hideActionIcons = false }: { monster: Monster; showStatus?: boolean; hideStatusChip?: boolean; hideActionIcons?: boolean }) {
    return <NpcPreview monster={monster} showStatus={showStatus} hideStatusChip={hideStatusChip} hideActionIcons={hideActionIcons} entityType="Monstro" />
}
