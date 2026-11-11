"use client"

import { useEffect, useMemo, useState } from "react"
import { motion } from "framer-motion"
import { AlertTriangle, ArrowRight, Ban, ClipboardCheck, Crosshair, Heart, HeartPulse, ListOrdered, Loader2, RefreshCw, ShieldAlert, SkipForward, Skull, Swords, Timer, X } from "lucide-react"
import { Button } from "@/components/ui/opex/button"
import { ConfirmDialog } from "@/components/ui/opex/confirm-dialog"
import { rarityColors } from "@/lib/config/colors"
import { DiceRollerPanel } from "@/features/dice-roller/components/dice-roller-panel"
import { CRITICAL_STAGE_CONFIG, CriticalHighlight, criticalBoxShadow } from "@/features/dice-roller/components/critical-highlight"
import { getDiceCriticalState } from "@/features/dice-roller/critical-state"
import type { DiceRollPreset, DiceRollResponse } from "@/features/dice-roller/types"
import { modeReasonText, parseDiceExpression } from "../../../combat-rules"
import type { CombatActionStep } from "../../../combat-types"
import { MADDOX_CHECK_DIE_HIDE_MS } from "../../../constants"
import type { MaddoxCombatPreparationDto, MaddoxGameCombatEventDto, MaddoxGameMessageDto } from "../../../game-types"
import { MemberAvatar, OpexChip, RarityChip } from "../../campaigns/campaign-visuals"
import { COMBAT_COLOR } from "../GameCombatCard"
import { ReplayDie } from "./ReplayDie"
import { ECONOMY_COLORS, ECONOMY_LABELS, HP_BAND_COLORS } from "./combat-visuals"
import { useHeldRoll, type HeldRoll } from "./use-held-roll"

/**
 * Cards do combate tático (Maddox 7) entre as falas da mesa: a ação de um combatente (com o dado rolado inline, como o
 * card do teste), a rolagem avulsa (iniciativa, teste contra a morte, concentração, salvaguarda, dano pedido), a janela
 * de reação (só quem reage vê as opções e a contagem) e a ordem de iniciativa.
 */

const STEP_LABELS: Record<CombatActionStep["kind"], string> = { attack: "Ataque", damage: "Dano", heal: "Cura", save: "Salvaguarda", check: "Teste", "sneak-choice": "Ataque furtivo" }

/** DND-49: "Vantagem: atacante invisível" (ou o motivo que for), para o rolador e o resultado do ataque. */
function ModeReasons({ step }: { step: Pick<CombatActionStep, "kind" | "mode" | "modeReasons"> }) {
    const text = step.kind === "attack" ? modeReasonText(step.mode, step.modeReasons ?? []) : null
    if (!text) return null
    return (
        <span data-testid="combat-step-mode">
            <RarityChip color={step.mode === "disadvantage" ? rarityColors.artifact : step.mode === "advantage" ? rarityColors.uncommon : rarityColors.common} className="text-[11px]">
                {text}
            </RarityChip>
        </span>
    )
}

/** DND-49: os dois d20 da vantagem/desvantagem, com o mantido em destaque. */
function KeptDice({ roll }: { roll: DiceRollResponse | null }) {
    const kept = roll?.selectedD20?.kept
    const discarded = roll?.selectedD20?.discarded
    if (kept === undefined || kept === null || discarded === undefined || discarded === null) return null
    return (
        <span className="text-[11px] text-white/60" data-testid="combat-step-d20s">
            d20: <span className="font-bold text-white">{kept}</span> · <span className="line-through">{discarded}</span>
        </span>
    )
}

const presetOf = (dice: string, label: string, mode: DiceRollPreset["mode"] = "normal"): DiceRollPreset => {
    const parsed = parseDiceExpression(dice) ?? { terms: [{ dice: "d20" as const, quantity: 1 }], modifier: 0 }
    return { label, terms: parsed.terms.length ? parsed.terms : [{ dice: "d4", quantity: 1 }], modifier: parsed.modifier, mode, source: "sheet" }
}

interface RollerProps {
    rollId: string
    dice: string
    label: string
    mode?: DiceRollPreset["mode"]
    mine: boolean
    replay: DiceRollResponse | null
    onRoll: (id: string) => Promise<DiceRollResponse>
    buttonLabel: string
    /** Ciclo do dado no card (DND-48): prende o passo do clique até o palco sair. */
    held: HeldRoll
    stepIndex: number
}

/**
 * Painel de dados inline: quem rola clica "Rolar"; os outros repetem a animação recebida pelo stream. O card segura o
 * painel no mesmo passo até o palco sair (a mesa nova chega com o passo já resolvido no meio da animação).
 */
function InlineRoller({ rollId, dice, label, mode, mine, replay, onRoll, buttonLabel, held, stepIndex }: RollerProps) {
    const [local, setLocal] = useState<DiceRollResponse | null>(null)
    const preset = useMemo(() => presetOf(dice, label, mode), [dice, label, mode])
    if (!mine && !replay) return null
    return (
        <div className="flex shrink-0 flex-col items-center justify-center gap-2 sm:min-w-[9rem]" data-testid="combat-roll-panel">
            <DiceRollerPanel
                preset={preset}
                hideConfigurationControls
                appearance="inline"
                stageVariant="bare"
                stageSize="compact"
                stageVisibility="roll"
                stageHideDelayMs={MADDOX_CHECK_DIE_HIDE_MS}
                rollButtonClassName="h-11 w-auto min-w-[7.5rem] px-6 text-sm font-semibold"
                rollButtonLabel={buttonLabel}
                hideRollButton={!mine || Boolean(local)}
                disableRolling={Boolean(local) || !mine}
                externalResult={mine ? null : replay}
                onRollSettled={held.settled}
                onStageHidden={held.hidden}
                rollRequest={async () => {
                    held.start(stepIndex)
                    try {
                        const result = await onRoll(rollId)
                        setLocal(result)
                        held.created(result)
                        return result
                    } catch (error) {
                        held.failed()
                        throw error
                    }
                }}
            />
        </div>
    )
}

/** Passo do card; o dado rolado pelo servidor agora (`replay`) anima antes de o resultado aparecer. */
function StepLine({ step, replay = null, rolling = false }: { step: CombatActionStep; replay?: DiceRollResponse | null; rolling?: boolean }) {
    const [settled, setSettled] = useState(false)
    // O dado do card ainda rola para este passo: o resultado só aparece quando ele para.
    if (rolling) {
        return (
            <li className="flex flex-wrap items-center gap-2 text-xs text-white/80" data-testid="combat-step" data-kind={step.kind} data-status="rolling">
                <span className="font-semibold text-white/60">{STEP_LABELS[step.kind]}</span>
                {step.targetName && <span className="text-white/70">→ {step.targetName}</span>}
                <span className="text-white/50">rolando…</span>
            </li>
        )
    }
    if (replay && !settled) {
        return (
            <li className="flex flex-wrap items-center gap-2 text-xs text-white/80" data-testid="combat-step" data-kind={step.kind} data-status="rolling">
                <span className="font-semibold text-white/60">{STEP_LABELS[step.kind]}</span>
                {step.targetName && <span className="text-white/70">→ {step.targetName}</span>}
                <ReplayDie roll={replay} label={`${STEP_LABELS[step.kind]}${step.targetName ? ` · ${step.targetName}` : ""}`} onSettled={() => setSettled(true)} />
            </li>
        )
    }
    return <StepResult step={step} />
}

export function StepResult({ step }: { step: CombatActionStep }) {
    const critical = step.roll && step.kind === "attack" ? getDiceCriticalState(step.roll) : null
    const verdict =
        step.kind === "attack" && step.hit !== null
            ? { label: step.critical ? "Crítico!" : step.hit ? "Acertou" : "Errou", color: step.hit ? (step.critical ? CRITICAL_STAGE_CONFIG["critical-success"].color : rarityColors.uncommon) : rarityColors.artifact }
            : step.kind === "save" && step.success !== null
              ? { label: step.success ? "Passou" : "Falhou", color: step.success ? rarityColors.uncommon : rarityColors.artifact }
              : step.kind === "check" && step.success !== null
                ? { label: step.success ? "Sucesso" : "Falha", color: step.success ? rarityColors.uncommon : rarityColors.artifact }
                : null
    return (
        <li className="flex flex-wrap items-center gap-2 text-xs text-white/80" data-testid="combat-step" data-kind={step.kind} data-status={step.status}>
            <span className="font-semibold text-white/60">{STEP_LABELS[step.kind]}</span>
            {step.targetName && <span className="text-white/70">→ {step.targetName}</span>}
            {step.status === "pending" && <span className="text-white/50">{step.kind === "sneak-choice" ? "aguardando a escolha" : step.roller === "player" ? "aguardando a rolagem" : "aguardando"}</span>}
            {step.kind === "sneak-choice" && step.status === "done" && <span data-testid="combat-step-sneak">{step.success ? `somado (+${step.dice})` : "não somado"}</span>}
            {step.status === "skipped" && <span className="text-white/40">não se aplica</span>}
            {step.total !== null && step.status === "done" && (
                <span className="text-base font-black text-white" data-testid="combat-step-total">
                    {step.total}
                </span>
            )}
            {step.kind === "attack" && step.status === "done" && <KeptDice roll={step.roll} />}
            {critical && <span className="text-[11px]" style={{ color: CRITICAL_STAGE_CONFIG[critical].color }}>{critical === "critical-success" ? "20 natural" : "1 natural"}</span>}
            {step.kind === "attack" && step.status !== "skipped" && <ModeReasons step={step} />}
            {verdict && (
                <span data-testid="combat-step-verdict">
                    <RarityChip color={verdict.color} className="text-[11px] font-semibold">
                        {verdict.label}
                    </RarityChip>
                </span>
            )}
            {step.amount !== null && step.kind !== "attack" && step.status === "done" && (
                <span className="font-semibold" style={{ color: step.kind === "heal" ? rarityColors.uncommon : rarityColors.artifact }} data-testid="combat-step-amount">
                    {step.kind === "heal" ? `+${step.amount} PV` : `${step.amount} de dano${step.damageType ? ` ${step.damageType}` : ""}`}
                </span>
            )}
            {step.note && <span className="text-white/50">({step.note})</span>}
        </li>
    )
}

interface ActionCardProps {
    message: MaddoxGameMessageDto
    mine: boolean
    replay: DiceRollResponse | null
    /** Dados que o servidor rolou neste card (salvaguarda de um adversário, DND-25), pelo índice do passo. */
    stepReplays?: ReadonlyMap<number, DiceRollResponse>
    onRoll: (actionId: string) => Promise<DiceRollResponse>
    onCancel: (actionId: string) => void
    /** DND-49: resposta ao "Somar ataque furtivo?" depois do acerto. */
    onSneakChoice?: (actionId: string, add: boolean) => void
    sneakChoosing?: boolean
}

export function CombatActionCard({ message, mine, replay, stepReplays, onRoll, onCancel, onSneakChoice, sneakChoosing = false }: ActionCardProps) {
    const action = message.combatAction!
    const accent = action.actorKind === "character" ? ECONOMY_COLORS[action.economy] : COMBAT_COLOR
    const pending = action.steps.find((step) => step.status === "pending" && step.roller === "player")
    // A escolha do furtivo vem antes do dano: enquanto ela não chega, não há dado para rolar.
    const sneakChoice = pending?.kind === "sneak-choice" ? pending : undefined
    const next = sneakChoice ? undefined : pending
    const held = useHeldRoll({ rolls: action.steps.map((step) => step.roll), pendingIndex: next ? action.steps.indexOf(next) : -1, replay: mine ? null : replay })
    const rollerStep = held.index >= 0 ? action.steps[held.index] : undefined
    const critical = action.steps.some((step) => step.kind === "attack" && step.critical)
    const cancelled = action.status === "cancelled"
    const Icon = action.actorKind === "character" ? (action.category === "spells" ? HeartPulse : Swords) : Crosshair
    return (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="pb-4" data-testid="combat-action-card" data-status={action.status}>
            <div className="relative space-y-2.5 overflow-hidden rounded-2xl border bg-white/[0.03] p-3.5" style={{ borderColor: `${accent}55`, boxShadow: critical ? `inset 3px 0 0 ${accent}, ${criticalBoxShadow(CRITICAL_STAGE_CONFIG["critical-success"].color)}` : `inset 3px 0 0 ${accent}`, opacity: cancelled ? 0.6 : 1 }}>
                {critical && <CriticalHighlight state="critical-success" rounded={{ inner: "rounded-xl", border: "rounded-xl" }} />}
                <div className="relative z-10 flex flex-col gap-3 sm:flex-row sm:items-stretch">
                    <div className="flex min-w-0 flex-1 items-start gap-2.5">
                        {action.actorKind === "character" ? <MemberAvatar name={action.actorName} imageUrl={message.portraitUrl} color={accent} className="mt-0.5 h-8 w-8 shrink-0" /> : <Icon className="mt-1 h-5 w-5 shrink-0" style={{ color: accent }} aria-hidden />}
                        <div className="min-w-0 flex-1 space-y-1.5">
                            <p className="flex flex-wrap items-center gap-1.5 text-xs text-white/60">
                                <RarityChip color={accent}>{action.actorKind === "character" ? ECONOMY_LABELS[action.economy] : "Adversário"}</RarityChip>
                                <span className="font-semibold text-white/80">{action.actorName}</span>
                                {action.opex && <OpexChip />}
                                {action.targets.length > 0 && <span>→ {action.targets.map((target) => target.name).join(", ")}</span>}
                            </p>
                            <p className="text-sm font-semibold text-white" data-testid="combat-action-label">
                                {action.label}
                                {action.spellLevel ? <span className="font-normal text-white/60"> · {action.spellLevel}º círculo</span> : null}
                                {cancelled ? <span className="font-normal text-white/50"> (cancelada)</span> : null}
                            </p>
                            {action.freeText && <p className="text-xs italic text-white/70">“{action.freeText}”</p>}
                            {action.steps.length > 0 && <ul className="space-y-1">{action.steps.map((step, index) => <StepLine key={index} step={step} replay={stepReplays?.get(index) ?? null} rolling={held.holding && !held.revealed && held.index === index} />)}</ul>}
                        </div>
                    </div>
                    {rollerStep && !cancelled && (
                        <InlineRoller key={`${message.id}:${held.index}`} rollId={message.id} dice={rollerStep.dice} label={`${action.label} · ${STEP_LABELS[rollerStep.kind]}`} mode={rollerStep.mode} mine={mine} replay={held.replay} onRoll={onRoll} buttonLabel={`Rolar ${STEP_LABELS[rollerStep.kind].toLowerCase()}`} held={held} stepIndex={held.index} />
                    )}
                </div>
                {sneakChoice && mine && !cancelled && onSneakChoice && !held.holding && (
                    <div className="relative z-10 flex flex-wrap items-center justify-end gap-2" data-testid="combat-sneak-choice">
                        <span className="text-xs text-white/70">O ataque acertou: somar o ataque furtivo ao dano?</span>
                        <Button size="sm" disabled={sneakChoosing} onClick={() => onSneakChoice(message.id, true)} data-testid="combat-sneak-add">
                            {sneakChoosing ? <Loader2 className="animate-spin" aria-hidden /> : <Swords aria-hidden />} Somar ataque furtivo (+{sneakChoice.dice})
                        </Button>
                        <Button size="sm" variant="ghost" disabled={sneakChoosing} onClick={() => onSneakChoice(message.id, false)} data-testid="combat-sneak-skip">
                            Não somar
                        </Button>
                    </div>
                )}
                {mine && action.cancellable && (
                    <div className="relative z-10 flex justify-end">
                        <Button size="sm" variant="ghost" onClick={() => onCancel(message.id)} data-testid="combat-action-cancel">
                            <X aria-hidden /> Cancelar ação
                        </Button>
                    </div>
                )}
            </div>
        </motion.div>
    )
}

const ROLL_TITLES = { initiative: "Iniciativa", "enemy-initiative": "Iniciativa", "death-save": "Teste contra a morte", concentration: "Concentração", save: "Salvaguarda", damage: "Dano" } as const

/**
 * Iniciativa de um grupo de inimigos (DND-25): espera os personagens rolarem; o servidor rola e todas as mesas veem o
 * dado (`replay`); quando ele para, aparecem o valor do dado, o modificador e o total. Recarregada depois, mostra só o
 * resultado.
 */
export function EnemyInitiativeCard({ message, replay }: { message: MaddoxGameMessageDto; replay: DiceRollResponse | null }) {
    const roll = message.combatRoll!
    const [settledId, setSettledId] = useState<string | null>(null)
    const rolling = Boolean(replay) && settledId !== replay?.rollId
    const name = roll.groupName ?? roll.reason.replace(/^Iniciativa · /, "")
    const accent = COMBAT_COLOR
    const result = roll.roll ?? replay
    const d20 = result ? (result.selectedD20?.kept ?? result.terms.find((term) => term.dice === "d20")?.results[0] ?? null) : null
    const discarded = result?.selectedD20?.discarded ?? null
    const modifier = result?.modifier ?? 0
    return (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="pb-4" data-testid="enemy-initiative-card" data-status={rolling ? "rolling" : roll.status}>
            <div className="flex flex-col gap-3 rounded-2xl border bg-white/[0.03] p-3.5 sm:flex-row sm:items-center" style={{ borderColor: `${accent}55`, boxShadow: `inset 3px 0 0 ${accent}` }}>
                <div className="flex min-w-0 flex-1 items-start gap-2.5">
                    <Crosshair className="mt-1 h-5 w-5 shrink-0" style={{ color: accent }} aria-hidden />
                    <div className="min-w-0 flex-1 space-y-1">
                        <p className="flex items-center gap-1.5 text-xs text-white/60">
                            <ListOrdered className="h-3.5 w-3.5" style={{ color: accent }} aria-hidden /> Iniciativa dos inimigos
                        </p>
                        <p className="text-sm font-semibold text-white" data-testid="enemy-initiative-name">
                            {name}
                        </p>
                        <div className="flex flex-wrap items-center gap-1.5">
                            <span className="rounded-md border border-white/20 bg-white/10 px-1.5 py-0.5 text-[11px] font-semibold text-white/80">{roll.dice}</span>
                            {roll.mode === "disadvantage" && <RarityChip color={rarityColors.artifact}>Desvantagem (surpreendidos)</RarityChip>}
                        </div>
                        {roll.status === "pending" && !replay && <p className="text-xs text-white/50" data-testid="enemy-initiative-waiting">Aguardando os personagens</p>}
                        {result && !rolling && (
                            <p className="flex flex-wrap items-center gap-2 text-sm text-white/80" data-testid="enemy-initiative-result">
                                <span className="text-2xl font-black text-white">{result.total}</span>
                                <span>
                                    d20 {d20 ?? "?"}
                                    {discarded !== null ? ` (descartado ${discarded})` : ""} {modifier >= 0 ? "+" : "−"} {Math.abs(modifier)}
                                </span>
                            </p>
                        )}
                    </div>
                </div>
                {replay && rolling && <ReplayDie roll={replay} label={`Iniciativa · ${name}`} onSettled={(settled) => setSettledId(settled.rollId)} />}
            </div>
        </motion.div>
    )
}

export function CombatRollCard({ message, mine, replay, onRoll }: { message: MaddoxGameMessageDto; mine: boolean; replay: DiceRollResponse | null; onRoll: (rollId: string) => Promise<DiceRollResponse> }) {
    const roll = message.combatRoll!
    if (roll.kind === "enemy-initiative") return <EnemyInitiativeCard message={message} replay={replay} />
    return <PlayerRollCard message={message} mine={mine} replay={replay} onRoll={onRoll} />
}

function PlayerRollCard({ message, mine, replay, onRoll }: { message: MaddoxGameMessageDto; mine: boolean; replay: DiceRollResponse | null; onRoll: (rollId: string) => Promise<DiceRollResponse> }) {
    const roll = message.combatRoll!
    const held = useHeldRoll({ rolls: [roll.roll], pendingIndex: roll.status === "pending" ? 0 : -1, replay: mine ? null : replay })
    const name = message.characterName ?? "Personagem"
    if (roll.status === "cancelled") {
        return (
            <p className="flex items-center justify-center gap-1.5 pb-3 text-xs text-white/50" data-testid="combat-roll-cancelled">
                <Ban className="h-3.5 w-3.5" aria-hidden /> {ROLL_TITLES[roll.kind]} de {name} cancelado{roll.outcome ? ` (${roll.outcome.toLowerCase()})` : ""}.
            </p>
        )
    }
    // Com o dado ainda rolando no card, o desfecho (cor e total) espera ele parar.
    const shown = !held.holding || held.revealed
    const success = shown ? roll.success : null
    const accent = success === true ? rarityColors.uncommon : success === false ? rarityColors.artifact : roll.kind === "death-save" ? rarityColors.artifact : rarityColors.legendary
    const Icon = roll.kind === "death-save" ? Skull : roll.kind === "initiative" ? ListOrdered : roll.kind === "damage" ? Swords : ShieldAlert
    const pendingMine = roll.status === "pending" && mine
    return (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="pb-4" data-testid="combat-roll-card" data-kind={roll.kind} data-status={roll.status}>
            <div className="flex flex-col gap-3 rounded-2xl border bg-white/[0.03] p-3.5 sm:flex-row sm:items-center" style={{ borderColor: `${accent}55`, boxShadow: `inset 3px 0 0 ${accent}` }}>
                <div className="flex min-w-0 flex-1 items-start gap-2.5">
                    <MemberAvatar name={name} imageUrl={message.portraitUrl} color={accent} className="mt-0.5 h-8 w-8 shrink-0" />
                    <div className="min-w-0 flex-1 space-y-1">
                        <p className="flex items-center gap-1.5 text-xs text-white/60">
                            <Icon className="h-3.5 w-3.5" style={{ color: accent }} aria-hidden />
                            {pendingMine ? `Role ${ROLL_TITLES[roll.kind].toLowerCase()}` : `${ROLL_TITLES[roll.kind]} de ${name}`}
                            {roll.rolledByName && <span>(rolado por {roll.rolledByName})</span>}
                        </p>
                        <p className="text-sm font-semibold text-white">{roll.reason}</p>
                        <div className="flex flex-wrap items-center gap-1.5">
                            <span className="rounded-md border border-white/20 bg-white/10 px-1.5 py-0.5 text-[11px] font-semibold text-white/80">{roll.dice}</span>
                            {roll.dc !== null && roll.kind !== "death-save" && <RarityChip color={rarityColors.rare}>CD {roll.dc}</RarityChip>}
                            {roll.mode !== "normal" && <RarityChip color={roll.mode === "advantage" ? rarityColors.uncommon : rarityColors.artifact}>{roll.mode === "advantage" ? "Vantagem" : "Desvantagem"}</RarityChip>}
                        </div>
                        {roll.status === "rolled" && shown && (
                            <p className="flex flex-wrap items-center gap-2 text-sm text-white/80" data-testid="combat-roll-outcome">
                                <span className="text-2xl font-black text-white">{roll.total}</span>
                                {roll.outcome && <span>{roll.outcome}</span>}
                            </p>
                        )}
                    </div>
                </div>
                {held.index === 0 && <InlineRoller rollId={message.id} dice={roll.dice} label={ROLL_TITLES[roll.kind]} mode={roll.mode} mine={mine} replay={held.replay} onRoll={onRoll} buttonLabel="Rolar" held={held} stepIndex={0} />}
            </div>
        </motion.div>
    )
}

/** Segundos que faltam até o prazo (atualiza a cada segundo). */
export function useCountdown(deadline: string, active: boolean): number {
    const target = new Date(deadline).getTime()
    const [now, setNow] = useState(() => Date.now())
    useEffect(() => {
        if (!active) return
        const timer = setInterval(() => setNow(Date.now()), 1000)
        return () => clearInterval(timer)
    }, [active])
    return Math.max(0, Math.ceil((target - now) / 1000))
}

export function CombatReactionCard({ message, mine, isOwner, busy, onDecide }: { message: MaddoxGameMessageDto; mine: boolean; isOwner: boolean; busy: boolean; onDecide: (reactionId: string, choice: string) => void }) {
    const reaction = message.combatReaction!
    const pending = reaction.status === "pending"
    const seconds = useCountdown(reaction.deadline, pending)
    const name = message.characterName ?? "Personagem"
    const accent = ECONOMY_COLORS.reaction
    return (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="pb-4" data-testid="combat-reaction-card" data-status={reaction.status}>
            <div className="space-y-2.5 rounded-2xl border bg-white/[0.03] p-3.5" style={{ borderColor: `${accent}55`, boxShadow: `inset 3px 0 0 ${accent}` }}>
                <p className="flex flex-wrap items-center gap-1.5 text-xs text-white/60">
                    <RarityChip color={accent}>Reação</RarityChip>
                    <span className="font-semibold text-white/80">{name}</span>
                    {pending && (
                        <span className="ml-auto flex items-center gap-1 font-semibold" style={{ color: seconds <= 10 ? rarityColors.artifact : accent }} data-testid="reaction-countdown">
                            <Timer className="h-3.5 w-3.5" aria-hidden /> {seconds}s
                        </span>
                    )}
                </p>
                <p className="text-sm text-white">{reaction.description}</p>
                {pending && mine && (
                    <div className="flex flex-wrap gap-2" data-testid="reaction-options">
                        {reaction.options.map((option) => (
                            <Button key={option.id} size="sm" disabled={busy} onClick={() => onDecide(message.id, option.id)} title={option.detail}>
                                <ShieldAlert aria-hidden /> {option.label}
                            </Button>
                        ))}
                        <Button size="sm" variant="outline" disabled={busy} onClick={() => onDecide(message.id, "none")} data-testid="reaction-decline">
                            Não reagir
                        </Button>
                    </div>
                )}
                {pending && !mine && (
                    <div className="flex flex-wrap items-center gap-2 text-xs text-white/60">
                        <span>Aguardando a reação de {name}…</span>
                        {isOwner && (
                            <Button size="sm" variant="ghost" disabled={busy} onClick={() => onDecide(message.id, "none")} data-testid="reaction-decline-for">
                                Não reagir no lugar
                            </Button>
                        )}
                    </div>
                )}
                {!pending && <p className="text-xs text-white/70" data-testid="reaction-outcome">{reaction.outcome ?? (reaction.status === "expired" ? "O prazo passou." : "Sem reação.")}</p>}
            </div>
        </motion.div>
    )
}

/** Card "Ordem de iniciativa" (na conversa, no momento em que a ordem fechou). */
export function CombatOrderCard({ combat }: { combat: MaddoxGameCombatEventDto }) {
    const order = combat.tactical?.order ?? []
    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="pb-4" data-testid="combat-order-card">
            <div className="space-y-2 rounded-2xl border bg-white/[0.03] p-3.5" style={{ borderColor: `${COMBAT_COLOR}55`, boxShadow: `inset 3px 0 0 ${COMBAT_COLOR}` }}>
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide" style={{ color: COMBAT_COLOR }}>
                    <ListOrdered className="h-3.5 w-3.5" aria-hidden /> Ordem de iniciativa · {combat.title}
                </p>
                <ol className="flex flex-wrap gap-1.5">
                    {order.map((slot, index) => (
                        <li key={slot.actorKey} className="flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs text-white/80" style={{ borderColor: `${slot.kind === "character" ? rarityColors.rare : HP_BAND_COLORS.ileso}55` }}>
                            <span className="text-white/40">{index + 1}.</span>
                            {slot.kind === "character" ? <Heart className="h-3 w-3 text-sky-300" aria-hidden /> : <Swords className="h-3 w-3 text-red-300" aria-hidden />}
                            {slot.name}
                            {slot.opex && <OpexChip />}
                            <span className="font-semibold text-white">{slot.initiative ?? "—"}</span>
                        </li>
                    ))}
                </ol>
            </div>
        </motion.div>
    )
}


/**
 * DND-41: card privado "Sua mesa está pronta" — o que o Maddox mudou na ficha e nas opções do personagem durante a
 * iniciativa, com o que era, o que ficou e o motivo. Só o dono do personagem o recebe (o servidor filtra).
 */
export function CombatPrepCard({ message }: { message: MaddoxGameMessageDto }) {
    const prep = message.combatPrep!
    const changes = prep.changes
    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="pb-4" data-testid="combat-prep-card">
            <div className="space-y-2 rounded-2xl border bg-white/[0.03] p-3.5" style={{ borderColor: `${rarityColors.uncommon}55`, boxShadow: `inset 3px 0 0 ${rarityColors.uncommon}` }}>
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide" style={{ color: rarityColors.uncommon }}>
                    <ClipboardCheck className="h-3.5 w-3.5" aria-hidden /> Sua mesa está pronta · {prep.characterName}
                </p>
                {changes.length === 0 ? (
                    <p className="text-sm text-white/75" data-testid="combat-prep-no-changes">
                        Nenhuma mudança: a ficha já estava pronta para o combate.
                    </p>
                ) : (
                    <ul className="space-y-1.5" data-testid="combat-prep-changes">
                        {changes.map((change, index) =>
                            change.area === "aviso" ? (
                                <li key={`aviso-${index}`} className="break-words rounded-lg border px-2.5 py-1.5 text-xs text-white/80" style={{ borderColor: `${rarityColors.artifact}55` }} data-applied={false} data-testid="combat-prep-notice">
                                    {change.reason}
                                </li>
                            ) : (
                                <li key={`${change.label}-${index}`} className="break-words rounded-lg border border-white/10 px-2.5 py-1.5 text-xs" data-applied={change.applied} data-refused={Boolean(change.refused)} data-testid="combat-prep-change">
                                    <p className="flex flex-wrap items-center gap-1.5 text-white/85">
                                        <span className="font-semibold text-white">{change.label}</span>
                                        <span className="text-white/50 line-through">{change.before}</span>
                                        <ArrowRight className="h-3 w-3 text-white/40" aria-hidden />
                                        <span>{change.after}</span>
                                        {!change.applied && <RarityChip color={rarityColors.artifact}>{change.refused ? "recusada" : "não aplicada: a ficha mudou"}</RarityChip>}
                                    </p>
                                    <p className="mt-0.5 whitespace-pre-wrap break-words text-white/60">{change.reason}</p>
                                    {change.refused && (
                                        <p className="mt-0.5 whitespace-pre-wrap break-words font-semibold" style={{ color: rarityColors.artifact }} data-testid="combat-prep-refused">
                                            {change.refused}
                                        </p>
                                    )}
                                </li>
                            ),
                        )}
                    </ul>
                )}
            </div>
        </motion.div>
    )
}

/**
 * DND-41: a preparação de uma ficha falhou e o combate parou. O dono da campanha vê o motivo e decide; os demais veem
 * "Aguardando o dono da campanha" (o motivo nem chega a eles).
 */
export function CombatPrepBlockedNotice({ preparation, isOwner, retrying, skipping, onRetry, onSkip }: { preparation: MaddoxCombatPreparationDto; isOwner: boolean; retrying: boolean; skipping: boolean; onRetry: (prepId: string) => void; onSkip: (prepId: string) => void }) {
    const [confirming, setConfirming] = useState<{ prepId: string; characterName: string } | null>(null)
    if (!preparation.blocked) return null
    if (!isOwner || !preparation.failures.length) {
        return (
            <div className="flex items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning" role="status" data-testid="combat-prep-waiting-owner">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden /> A preparação de uma ficha falhou. Aguardando o dono da campanha.
            </div>
        )
    }
    return (
        <div className="space-y-1.5" data-testid="combat-prep-failures">
            {preparation.failures.map((failure) => (
                <div key={failure.prepId} className="flex flex-wrap items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive" role="alert" data-testid="combat-prep-failure">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    <span className="min-w-0 flex-1">
                        A preparação da mesa de {failure.characterName} falhou: {failure.error}
                    </span>
                    <Button size="sm" variant="outline" className="h-7" onClick={() => onRetry(failure.prepId)} disabled={retrying || skipping}>
                        {retrying ? <Loader2 className="animate-spin" aria-hidden /> : <RefreshCw aria-hidden />} Tentar de novo
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7" onClick={() => setConfirming({ prepId: failure.prepId, characterName: failure.characterName })} disabled={retrying || skipping}>
                        <SkipForward aria-hidden /> Seguir sem preparação
                    </Button>
                </div>
            ))}
            <ConfirmDialog
                open={Boolean(confirming)}
                onOpenChange={(open) => (open ? null : setConfirming(null))}
                title={`Seguir sem a preparação de ${confirming?.characterName ?? "personagem"}?`}
                description="A ficha usa a lista que o servidor calcula, sem a revisão do Maddox. O combate segue."
                confirmLabel="Seguir sem preparação"
                pending={skipping}
                onConfirm={() => {
                    if (confirming) onSkip(confirming.prepId)
                    setConfirming(null)
                }}
            />
        </div>
    )
}
