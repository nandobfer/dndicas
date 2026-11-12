"use client"

import type { UseFormReturn } from "react-hook-form"
import { HeartPulse } from "lucide-react"
import { GlassSelector } from "@/components/ui/glass-selector"
import type { CreateMaddoxCampaignInput } from "../../campaign-schemas"

type HpChoice = "band" | "numbers"

const OPTIONS: { value: HpChoice; label: string }[] = [
    { value: "band", label: "Estado por texto" },
    { value: "numbers", label: "Mostrar PV" },
]

/**
 * PV dos combatentes do mestre no combate tático (DND-53): inimigos e aliados NPC, cada lado com a sua escolha. Padrão =
 * só a faixa de estado ("Ileso / Ferido / Muito ferido / Caído"); "Mostrar PV" exibe atual/máximo. A CA segue oculta.
 */
export function CombatantHpField({ form }: { form: UseFormReturn<CreateMaddoxCampaignInput> }) {
    const enemies = form.watch("showEnemyHp") ?? false
    const allies = form.watch("showAllyHp") ?? false
    return (
        <div className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-4" data-testid="combatant-hp-field">
            <p className="flex items-center gap-2 text-sm font-medium text-white">
                <HeartPulse className="h-4 w-4 text-primary" aria-hidden /> PV nos combates
            </p>
            <p className="text-xs text-white/60">Por texto, a ordem de iniciativa mostra só o estado (Ileso, Ferido, Muito ferido, Caído). Com o PV, mostra os números atual/máximo. A CA continua oculta.</p>
            <div className="space-y-1.5" data-testid="enemy-hp-field">
                <p className="text-xs font-medium text-white/80">PV dos inimigos</p>
                <GlassSelector<HpChoice> value={enemies ? "numbers" : "band"} onChange={(value) => form.setValue("showEnemyHp", value === "numbers", { shouldDirty: true })} options={OPTIONS} size="sm" layoutId="maddox-enemy-hp" />
            </div>
            <div className="space-y-1.5" data-testid="ally-hp-field">
                <p className="text-xs font-medium text-white/80">PV dos aliados (NPCs)</p>
                <GlassSelector<HpChoice> value={allies ? "numbers" : "band"} onChange={(value) => form.setValue("showAllyHp", value === "numbers", { shouldDirty: true })} options={OPTIONS} size="sm" layoutId="maddox-ally-hp" />
            </div>
        </div>
    )
}
