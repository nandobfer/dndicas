"use client"

import { useMemo, useState } from "react"
import { motion } from "framer-motion"
import { Ban, Dices } from "lucide-react"
import { cn } from "@/core/utils"
import { rarityColors } from "@/lib/config/colors"
import type { CalcPart } from "@/features/character-sheets/utils/dnd-calculations"
import { useSheet } from "@/features/character-sheets/api/character-sheets-queries"
import type { CharacterSheet } from "@/features/character-sheets/types/character-sheet.types"
import { DiceRollerPanel } from "@/features/dice-roller/components/dice-roller-panel"
import { CRITICAL_STAGE_CONFIG, CriticalHighlight, criticalBoxShadow } from "@/features/dice-roller/components/critical-highlight"
import { getDiceCriticalState } from "@/features/dice-roller/critical-state"
import type { DiceRollPreset, DiceRollResponse } from "@/features/dice-roller/types"
import { checkKindLabel, checkModeLabel, checkModifier, checkTitle, signed } from "../../check-modifier"
import { MADDOX_CHECK_DIE_HIDE_MS } from "../../constants"
import type { MaddoxGameMessageDto } from "../../game-types"
import { MemberAvatar, RarityChip } from "../campaigns/campaign-visuals"

/** Cores das partes do modificador, as mesmas do `CalcTooltip` da ficha. */
export const CHECK_PART_CLASSES: Record<CalcPart["color"], string> = {
    strength: "bg-amber-500/20 text-amber-300 border border-amber-500/30",
    dexterity: "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30",
    constitution: "bg-red-500/20 text-red-300 border border-red-500/30",
    intelligence: "bg-blue-500/20 text-blue-300 border border-blue-500/30",
    wisdom: "bg-slate-400/20 text-slate-300 border border-slate-400/30",
    charisma: "bg-purple-500/20 text-purple-300 border border-purple-500/30",
    prof: "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30",
    bonus: "bg-green-500/20 text-green-300 border border-green-500/30",
    base: "bg-white/10 text-white/60 border border-white/20",
    manual: "bg-orange-500/20 text-orange-300 border border-orange-500/30",
}

interface Props {
    message: MaddoxGameMessageDto
    /** O teste é do meu personagem. */
    mine: boolean
    color: string
    /** Rolagem recém-feita por outro jogador (stream da mesa): repete a animação com o resultado oficial. */
    replay: DiceRollResponse | null
    /** Rola no servidor (o painel de dados chama no "Rolar"). */
    onRoll: (checkId: string) => Promise<DiceRollResponse>
}

/**
 * Teste pedido pelo Maddox (Maddox 5). Pendente, só o jogador indicado o recebe: o d20 renderizado, as partes do
 * modificador da ficha e o botão "Rolar" (a rolagem é do servidor). Rolado, todos veem quem rolou, o dado — com a
 * animação repetida em quem estava com a mesa aberta —, o modificador e o total; com a CD visível, sucesso ou falha.
 */
export function GameCheckCard({ message, mine, color, replay, onRoll }: Props) {
    const check = message.check!
    const name = message.characterName ?? "Personagem"
    const spec = { kind: check.kind, ability: check.ability, skill: check.skill }
    const title = checkTitle(spec)
    const [localRoll, setLocalRoll] = useState<DiceRollResponse | null>(null)
    // Modificador do painel congelado no clique: o painel se reinicia quando o preset muda, então o resultado do
    // servidor (que pode trazer outro modificador) nunca troca o preset de quem está vendo o dado rolar.
    const [frozenModifier, setFrozenModifier] = useState<number | null>(null)
    // Fim da animação do dado neste card (local ou repetida): só então a linha do resultado aparece.
    const [settledRoll, setSettledRoll] = useState<DiceRollResponse | null>(null)
    const pendingMine = check.status === "pending" && mine
    const sheet = useSheet(pendingMine && !localRoll ? check.sheetId : null)
    const preview = useMemo(() => (sheet.data ? checkModifier(sheet.data as CharacterSheet, spec) : null), [sheet.data, spec.kind, spec.ability, spec.skill]) // eslint-disable-line react-hooks/exhaustive-deps
    const roll = localRoll ?? check.roll ?? replay
    const parts = check.modifierParts.length ? check.modifierParts : (preview?.parts ?? [])
    const modifier = roll ? roll.modifier : (preview?.value ?? 0)
    // Quem rola mantém o próprio painel (a animação local); os outros repetem a rolagem recebida pelo stream da mesa. O
    // painel fica montado durante toda a rolagem: o palco do dado só aparece nela e sai sozinho depois do fim.
    const showPanel = pendingMine || Boolean(localRoll) || Boolean(replay)
    const animated = Boolean(localRoll) || Boolean(replay)
    const resultRoll = animated ? settledRoll : (check.roll ?? null)
    const presetModifier = frozenModifier ?? (pendingMine ? (preview?.value ?? 0) : (replay ?? check.roll)?.modifier ?? 0)
    const preset = useMemo<DiceRollPreset>(() => ({ label: title, terms: [{ dice: "d20", quantity: 1 }], modifier: presetModifier, mode: check.mode, source: "sheet" }), [title, presetModifier, check.mode])
    // A prévia do modificador depende da ficha: "Rolar" espera ela carregar.
    const sheetLoading = pendingMine && !localRoll && !sheet.data && !sheet.isError

    if (check.status === "cancelled") {
        return (
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center justify-center gap-1.5 pb-3 text-xs text-white/50" data-testid="game-check-cancelled">
                <Ban className="h-3.5 w-3.5" aria-hidden />
                <span>
                    Teste de <span className="font-medium text-white/70">{name}</span> cancelado{check.cancelReason ? ` (${check.cancelReason.toLowerCase()})` : ""}.
                </span>
            </motion.p>
        )
    }

    const rolled = check.status === "rolled" || Boolean(localRoll)
    // Cor do card pelo resultado (só depois que o dado para): CD visível → verde/vermelho do desfecho; CD secreta → só o
    // crítico (20 natural sempre passa, 1 natural sempre falha); senão, a cor do rigor.
    const critical = resultRoll ? getDiceCriticalState(resultRoll) : null
    const outcome: "success" | "failure" | "none" = resultRoll && check.success !== null ? (check.success ? "success" : "failure") : "none"
    const accent = outcome === "success" ? rarityColors.uncommon : outcome === "failure" ? rarityColors.artifact : critical ? CRITICAL_STAGE_CONFIG[critical].color : color
    return (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="pb-4" data-testid={pendingMine && !localRoll ? "game-check-request" : "game-check-result"}>
            <div
                className="relative space-y-3 overflow-hidden rounded-2xl border bg-white/[0.03] p-3.5"
                style={{ borderColor: `${accent}55`, boxShadow: critical ? `inset 3px 0 0 ${accent}, ${criticalBoxShadow(accent)}` : `inset 3px 0 0 ${accent}` }}
                data-testid="check-card"
                data-accent={accent}
                data-outcome={outcome}
                data-critical={critical ?? "none"}
            >
                {critical && <CriticalHighlight state={critical} rounded={{ inner: "rounded-xl", border: "rounded-xl" }} />}
                <div className="relative z-10 flex flex-col gap-3 sm:flex-row sm:items-stretch">
                    <div className="flex min-w-0 flex-1 items-start gap-2.5">
                        <MemberAvatar name={name} imageUrl={message.portraitUrl} color={accent} className="mt-0.5 h-8 w-8 shrink-0 self-start" />
                        <div className="min-w-0 flex-1 space-y-1">
                            <p className="flex flex-wrap items-center gap-1.5 text-xs text-white/60">
                                <Dices className="h-3.5 w-3.5" style={{ color: accent }} aria-hidden />
                                {pendingMine && !localRoll ? "O Maddox pede um teste para você" : rolled ? `${name} ${replay && !check.roll ? "está rolando" : "rolou"}` : `Teste de ${name}`}
                                {check.rolledByName && <span>(rolado por {check.rolledByName} no lugar do jogador)</span>}
                            </p>
                            <p className="text-sm font-semibold text-white" data-testid="check-title">
                                {checkKindLabel(check.kind)}: {title}
                            </p>
                            {check.reason && <p className="text-xs text-white/70">{check.reason}</p>}
                            <div className="flex flex-wrap items-center gap-1.5 pt-0.5" data-testid="check-modifiers">
                                <span className="rounded-md border border-white/20 bg-white/10 px-1.5 py-0.5 text-[11px] font-semibold text-white/80">d20</span>
                                {parts.map((part, index) => (
                                    <span key={`${part.label}-${index}`} className={cn("rounded-md px-1.5 py-0.5 text-[11px] font-semibold", CHECK_PART_CLASSES[part.color])}>
                                        {part.label} {part.value}
                                    </span>
                                ))}
                                <span className="text-[11px] font-semibold text-white/80" data-testid="check-modifier-total">
                                    = d20 {signed(modifier)}
                                </span>
                                {check.mode !== "normal" && <RarityChip color={check.mode === "advantage" ? rarityColors.uncommon : rarityColors.artifact}>{checkModeLabel(check.mode)}</RarityChip>}
                                {check.dc !== null && <RarityChip color={rarityColors.rare}>CD {check.dc}</RarityChip>}
                            </div>
                        </div>
                    </div>

                    {showPanel && (
                        <div className={cn("flex shrink-0 flex-col items-center justify-center gap-2", !settledRoll && "sm:min-w-[9rem]")} data-testid="check-roll-column">
                            <div className="max-w-full" data-testid="check-dice-panel">
                                <DiceRollerPanel
                                    preset={preset}
                                    hideConfigurationControls
                                    appearance="inline"
                                    stageVariant="bare"
                                    stageSize="compact"
                                    stageVisibility="roll"
                                    stageHideDelayMs={MADDOX_CHECK_DIE_HIDE_MS}
                                    rollButtonClassName="h-11 w-auto min-w-[7.5rem] px-6 text-sm font-semibold"
                                    onRollSettled={setSettledRoll}
                                    rollButtonLabel="Rolar"
                                    hideRollButton={(!pendingMine && !localRoll) || Boolean(settledRoll)}
                                    disableRolling={Boolean(localRoll) || !pendingMine || sheetLoading}
                                    disabledRollingMessage={settledRoll ? null : localRoll ? "Resultado enviado ao Maddox." : sheetLoading ? "Carregando a ficha…" : null}
                                    externalResult={pendingMine || localRoll ? null : replay}
                                    rollRequest={async () => {
                                        setFrozenModifier(presetModifier)
                                        const result = await onRoll(message.id)
                                        setLocalRoll(result)
                                        return result
                                    }}
                                />
                            </div>
                        </div>
                    )}
                </div>

                {resultRoll && <CheckResultLine roll={resultRoll} outcome={outcome} />}
            </div>
        </motion.div>
    )
}

/** Total, d20 (com o descartado) e modificador numa linha, com as bolhas do desfecho (CD visível) e do crítico. */
function CheckResultLine({ roll, outcome }: { roll: DiceRollResponse; outcome: "success" | "failure" | "none" }) {
    const kept = roll.selectedD20?.kept ?? roll.terms[0]?.results[0] ?? 0
    const discarded = roll.selectedD20?.discarded
    const critical = getDiceCriticalState(roll)
    const criticalColor = critical ? CRITICAL_STAGE_CONFIG[critical].color : null
    return (
        <div className="relative z-10 flex flex-wrap items-center gap-2 text-sm text-white/80" data-testid="check-roll-result">
            <span className="text-2xl font-black text-white" data-testid="check-roll-total">
                {roll.total}
            </span>
            <span>
                d20{" "}
                <span className="font-semibold" style={criticalColor ? { color: criticalColor } : undefined}>
                    {kept}
                </span>
                {discarded !== undefined && <span className="text-white/40"> (descartado {discarded})</span>} {signed(roll.modifier)}
            </span>
            {outcome !== "none" && (
                <span data-testid="check-outcome">
                    <RarityChip color={outcome === "success" ? rarityColors.uncommon : rarityColors.artifact} className="text-xs font-semibold">
                        {outcome === "success" ? "Sucesso" : "Falha"}
                    </RarityChip>
                </span>
            )}
            {critical && criticalColor && (
                <span data-testid="check-critical">
                    <RarityChip color={criticalColor} className="text-xs font-semibold">
                        {kept === 20 ? "20 natural" : "1 natural"}
                    </RarityChip>
                </span>
            )}
        </div>
    )
}
