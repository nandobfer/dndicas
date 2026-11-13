"use client"

import { useMemo, useState } from "react"
import { motion } from "framer-motion"
import { AlertTriangle, CheckCircle2, Loader2, Moon, Send, Sunrise, XCircle } from "lucide-react"
import { Button } from "@/components/ui/opex/button"
import { ConfirmDialog } from "@/components/ui/opex/confirm-dialog"
import { Textarea } from "@/components/ui/opex/textarea"
import { rarityColors } from "@/lib/config/colors"
import { DiceRollerPanel } from "@/features/dice-roller/components/dice-roller-panel"
import { DiceResultTooltip } from "@/features/dice-roller/components/dice-result-tooltip"
import type { DiceRollPreset, DiceRollResponse } from "@/features/dice-roller/types"
import { MADDOX_CHECK_DIE_HIDE_MS, MADDOX_REST_EXCHANGE_REQUESTS_MAX, messageAvatarContext } from "../../../constants"
import type { MaddoxGameMessageDto, MaddoxRestCharacterDto, MaddoxRestDto } from "../../../game-types"
import { restCharacterStatusText, restIntroText, restStatusLabel, restTitle } from "../../../rest-view"
import { MemberAvatar, OpexChip, RarityChip } from "../../campaigns/campaign-visuals"

/** Ações do balão do descanso (DND-58). Sem elas (diário, só leitura), o balão só mostra o que aconteceu. */
export interface RestHandlers {
    isOwner: boolean
    onRollHitDie: (restId: string, characterId: string) => Promise<DiceRollResponse>
    onDeclineHitDice: (restId: string, characterId: string) => Promise<void> | void
    onExchange: (restId: string, characterId: string, text: string) => Promise<void> | void
    onFinishExchange: (restId: string, characterId: string, nothing: boolean) => Promise<void> | void
    onRetryPrep: (restId: string, characterId: string) => Promise<void> | void
    onSkipPrep: (restId: string, characterId: string) => Promise<void> | void
    busy?: boolean
}

interface Props {
    message: MaddoxGameMessageDto
    color: string
    handlers: RestHandlers | null
    /** Dados de vida rolados por outros (stream da mesa), por `{mensagem}:{personagem}`. */
    replays: ReadonlyMap<string, DiceRollResponse>
}

/**
 * Balão do descanso conduzido pelo Maddox (DND-58): o tipo, a frase do Maddox, e um bloco por personagem com o que a ficha
 * recuperou (e o que não recuperou, com o motivo), os dados de vida rolados na tela (curto) e as trocas. Interrompido, diz
 * que nada foi recuperado.
 */
export function RestCard({ message, color, handlers, replays }: Props) {
    const rest = message.rest as MaddoxRestDto
    const interrupted = rest.status === "interrupted"
    const accent = interrupted ? rarityColors.artifact : rest.type === "long" ? rarityColors.veryRare : rarityColors.rare
    const Icon = rest.type === "long" ? Moon : Sunrise
    return (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="pb-4" data-testid="rest-card" data-rest-type={rest.type} data-rest-status={rest.status}>
            <div className="relative space-y-3 overflow-hidden rounded-2xl border bg-gradient-to-br from-white/[0.05] to-white/[0.01] p-3.5" style={{ borderColor: `${accent}55`, boxShadow: `inset 3px 0 0 ${accent}` }}>
                <div className="flex items-start gap-2.5">
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border" style={{ borderColor: `${accent}66`, backgroundColor: `${accent}1f`, color: accent }}>
                        <Icon className="h-4 w-4" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1 space-y-1">
                        <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-white" data-testid="rest-title">
                            {restTitle(rest.type)}
                            <RarityChip color={accent}>{restStatusLabel(rest.status)}</RarityChip>
                        </p>
                        <p className="text-xs text-white/60" data-testid="rest-intro">
                            {restIntroText(rest.type)}
                        </p>
                        {rest.description && <p className="whitespace-pre-wrap text-sm italic text-white/80">{rest.description}</p>}
                    </div>
                </div>
                {interrupted ? (
                    <p className="flex items-start gap-1.5 rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-200" role="status" data-testid="rest-interrupted">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                        <span>
                            O descanso foi interrompido{rest.interruption ? `: ${rest.interruption}` : ""}. Nada foi recuperado ({rest.characters.map((entry) => entry.name).join(", ")}).
                        </span>
                    </p>
                ) : (
                    <div className="space-y-2.5">
                        {rest.characters.map((entry) => (
                            <RestCharacterRow key={entry.characterId} messageId={message.id} entry={entry} color={accent} rest={rest} handlers={handlers} replay={replays.get(`${message.id}:${entry.characterId}`) ?? null} />
                        ))}
                    </div>
                )}
            </div>
        </motion.div>
    )
}

function RestCharacterRow({ messageId, entry, color, rest, handlers, replay }: { messageId: string; entry: MaddoxRestCharacterDto; color: string; rest: MaddoxRestDto; handlers: RestHandlers | null; replay: DiceRollResponse | null }) {
    // O painel do dado fica montado até o palco sair, mesmo que a parte feche no meio da animação (DND-48).
    const [holding, setHolding] = useState(false)
    const [confirmSkip, setConfirmSkip] = useState(false)
    const canRoll = Boolean(handlers) && entry.can.roll
    const showRoller = Boolean(handlers) && (canRoll || holding)
    return (
        <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-3" data-testid="rest-character" data-character-id={entry.characterId} data-done={entry.done ? "true" : "false"}>
            <div className="flex items-center gap-2">
                <MemberAvatar name={entry.name} imageUrl={entry.portraitUrl} color={color} context={messageAvatarContext({ opex: entry.opex, mine: entry.can.roll || entry.can.exchange })} className="h-7 w-7 shrink-0" />
                <p className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 text-sm font-semibold text-white/90">
                    {entry.name}
                    {entry.opex && <OpexChip />}
                </p>
                <span className="flex items-center gap-1 text-[11px] text-white/60" data-testid="rest-character-status">
                    {entry.done ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" aria-hidden /> : <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
                    {restCharacterStatusText(entry)}
                </span>
            </div>

            {entry.answeredBy === "owner" && !entry.done && (
                <p className="text-xs text-amber-200" data-testid="rest-owner-answers">
                    {handlers?.isOwner ? `O agente de ${entry.name} não respondeu: responda por ele.` : `O dono da campanha está respondendo por ${entry.name}.`}
                </p>
            )}

            {entry.prep.status === "failed" && (
                <div className="space-y-1.5 rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100" data-testid="rest-prep-failed">
                    <p>A preparação da ficha falhou. A mesa espera o dono da campanha.</p>
                    {entry.prep.error && <p className="text-amber-200/80">Motivo: {entry.prep.error}</p>}
                    {handlers && entry.can.retryPrep && (
                        <div className="flex flex-wrap gap-2 pt-1">
                            <Button type="button" size="sm" variant="secondary" disabled={handlers.busy} onClick={() => void handlers.onRetryPrep(messageId, entry.characterId)}>
                                Tentar de novo
                            </Button>
                            <Button type="button" size="sm" variant="ghost" disabled={handlers.busy} onClick={() => setConfirmSkip(true)}>
                                Seguir sem
                            </Button>
                            <ConfirmDialog
                                open={confirmSkip}
                                onOpenChange={setConfirmSkip}
                                title={`Seguir sem o catálogo para ${entry.name}?`}
                                description="A recuperação da regra é aplicada (PV, dados de vida, espaços no descanso longo, testes contra a morte e exaustão), mas os recursos e os espaços do descanso curto não voltam."
                                confirmLabel="Seguir sem"
                                pending={handlers.busy}
                                onConfirm={() => {
                                    setConfirmSkip(false)
                                    void handlers.onSkipPrep(messageId, entry.characterId)
                                }}
                            />
                        </div>
                    )}
                </div>
            )}

            {entry.prep.status === "ready" && (entry.prep.recovered.length > 0 || entry.prep.notRecovered.length > 0) && (
                <div className="space-y-1 text-xs" data-testid="rest-recovery">
                    {entry.prep.recovered.length > 0 && (
                        <ul className="space-y-0.5 text-emerald-200/90">
                            {entry.prep.recovered.map((line, index) => (
                                <li key={`r-${index}`} data-testid="rest-recovered">
                                    {line.label}: {line.before} → {line.after}
                                </li>
                            ))}
                        </ul>
                    )}
                    {entry.prep.notRecovered.length > 0 && (
                        <ul className="space-y-0.5 text-white/55">
                            {entry.prep.notRecovered.map((line, index) => (
                                <li key={`n-${index}`} className="flex items-start gap-1" data-testid="rest-not-recovered">
                                    <XCircle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                                    <span>
                                        {line.label} não voltou ({line.reason})
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}
            {entry.prep.status === "ready" && !entry.prep.recovered.length && !entry.prep.notRecovered.length && rest.type === "long" && <p className="text-xs text-white/55">Nada a recuperar: a ficha já estava completa.</p>}

            {(entry.hitDice.status !== "none" || entry.hitDice.rolls.length > 0) && (
                <div className="space-y-1.5" data-testid="rest-hit-dice">
                    {entry.hitDice.rolls.length > 0 && (
                        <ul className="space-y-0.5 text-xs text-white/75">
                            {entry.hitDice.rolls.map((roll, index) => (
                                <li key={index} data-testid="rest-hit-die-roll">
                                    {entry.hitDice.die ?? "Dado"}:{" "}
                                    <DiceResultTooltip roll={roll.roll}>
                                        <span className="font-semibold text-white">{roll.total}</span>
                                    </DiceResultTooltip>{" "}
                                    → +{roll.healed} PV ({roll.hpBefore} → {roll.hpAfter})
                                </li>
                            ))}
                        </ul>
                    )}
                    {showRoller && handlers ? (
                        <RestHitDiceRoller messageId={messageId} entry={entry} handlers={handlers} canRoll={canRoll} onHoldChange={setHolding} />
                    ) : replay && !entry.can.roll ? (
                        <div className="max-w-[10rem]" data-testid="rest-hit-die-replay">
                            <DiceRollerPanel preset={{ label: `${entry.name} · dado de vida`, terms: [{ dice: (entry.hitDice.die ?? "d8") as "d8", quantity: 1 }], modifier: replay.modifier, mode: "normal", source: "sheet" }} hideConfigurationControls appearance="inline" stageVariant="bare" stageSize="compact" stageVisibility="roll" stageHideDelayMs={MADDOX_CHECK_DIE_HIDE_MS} hideRollButton externalResult={replay} />
                        </div>
                    ) : null}
                </div>
            )}

            {handlers && entry.can.exchange ? (
                <RestExchangeBox messageId={messageId} entry={entry} rest={rest} handlers={handlers} />
            ) : entry.exchange.applied.length > 0 ? (
                <ul className="space-y-0.5 text-xs text-sky-200/90" data-testid="rest-exchanges">
                    {entry.exchange.applied.map((line, index) => (
                        <li key={index}>{line}</li>
                    ))}
                </ul>
            ) : null}
        </div>
    )
}

function RestHitDiceRoller({ messageId, entry, handlers, canRoll, onHoldChange }: { messageId: string; entry: MaddoxRestCharacterDto; handlers: RestHandlers; canRoll: boolean; onHoldChange: (holding: boolean) => void }) {
    const [round, setRound] = useState(0)
    const [localRoll, setLocalRoll] = useState<DiceRollResponse | null>(null)
    const [error, setError] = useState<string | null>(null)
    const die = (entry.hitDice.die ?? "d8") as "d8"
    const constitution = entry.hitDice.constitution
    const preset = useMemo<DiceRollPreset>(() => ({ label: `${entry.name} · dado de vida`, terms: [{ dice: die, quantity: 1 }], modifier: constitution, mode: "normal", source: "sheet" }), [entry.name, die, constitution])
    const release = () => {
        setLocalRoll(null)
        setRound((value) => value + 1)
        onHoldChange(false)
    }
    return (
        <div className="space-y-1.5" data-testid="rest-hit-die-roller">
            <p className="text-xs text-white/70">
                Rolar dado de vida ({die} {constitution >= 0 ? "+" : "−"} {Math.abs(constitution)} CON) · PV {entry.hitDice.hp}/{entry.hitDice.hpMax} · {entry.hitDice.available} dado(s) restante(s)
            </p>
            <div className="flex flex-wrap items-center gap-2">
                <div className="max-w-full">
                    <DiceRollerPanel
                        key={round}
                        preset={preset}
                        hideConfigurationControls
                        appearance="inline"
                        stageVariant="bare"
                        stageSize="compact"
                        stageVisibility="roll"
                        stageHideDelayMs={MADDOX_CHECK_DIE_HIDE_MS}
                        rollButtonClassName="h-9 w-auto px-4 text-sm font-semibold"
                        rollButtonLabel="Rolar dado de vida"
                        hideRollButton={Boolean(localRoll)}
                        disableRolling={Boolean(localRoll) || !canRoll || Boolean(handlers.busy)}
                        disabledRollingMessage={null}
                        onStageHidden={release}
                        rollRequest={async () => {
                            setError(null)
                            onHoldChange(true)
                            try {
                                const result = await handlers.onRollHitDie(messageId, entry.characterId)
                                setLocalRoll(result)
                                return result
                            } catch (failure) {
                                onHoldChange(false)
                                setError(failure instanceof Error ? failure.message : "Não foi possível rolar o dado de vida.")
                                throw failure
                            }
                        }}
                    />
                </div>
                {canRoll && !localRoll && (
                    <Button type="button" size="sm" variant="ghost" disabled={handlers.busy} onClick={() => void handlers.onDeclineHitDice(messageId, entry.characterId)} data-testid="rest-hit-dice-stop">
                        {entry.hitDice.rolls.length ? "Parar de rolar" : "Não rolar"}
                    </Button>
                )}
            </div>
            {error && (
                <p className="text-xs text-red-300" role="alert">
                    {error}
                </p>
            )}
        </div>
    )
}

function RestExchangeBox({ messageId, entry, rest, handlers }: { messageId: string; entry: MaddoxRestCharacterDto; rest: MaddoxRestDto; handlers: RestHandlers }) {
    const [text, setText] = useState("")
    const [confirmFinish, setConfirmFinish] = useState(false)
    const left = MADDOX_REST_EXCHANGE_REQUESTS_MAX - entry.exchange.requests
    const send = async () => {
        const value = text.trim()
        if (!value) return
        try {
            await handlers.onExchange(messageId, entry.characterId, value)
            setText("")
        } catch {
            // O aviso já saiu (toast); o texto fica para tentar de novo.
        }
    }
    return (
        <div className="space-y-1.5" data-testid="rest-exchange">
            <p className="text-xs text-white/70">O que {entry.name} quer trocar depois do {rest.type === "long" ? "descanso longo" : "descanso curto"}? (magias preparadas, truques, invocações, manobras… o que a classe permitir)</p>
            {entry.exchange.applied.length > 0 && (
                <ul className="space-y-0.5 text-xs text-sky-200/90" data-testid="rest-exchanges">
                    {entry.exchange.applied.map((line, index) => (
                        <li key={index}>{line}</li>
                    ))}
                </ul>
            )}
            <div className="flex items-end gap-2">
                <Textarea aria-label={`Trocas de ${entry.name} depois do descanso`} value={text} onChange={(event) => setText(event.target.value)} rows={2} maxLength={4_000} className="min-h-[44px] flex-1 resize-none text-sm" disabled={handlers.busy || left <= 0} placeholder="Ex.: troco Escudo Arcano por Mísseis Mágicos." />
                <Button type="button" size="icon" className="h-9 w-9 shrink-0 rounded-full" aria-label="Enviar pedido de troca" disabled={handlers.busy || !text.trim() || left <= 0} onClick={() => void send()}>
                    <Send className="h-4 w-4" aria-hidden />
                </Button>
            </div>
            <div className="flex flex-wrap gap-2">
                {entry.exchange.requests === 0 ? (
                    <Button type="button" size="sm" variant="ghost" disabled={handlers.busy} onClick={() => void handlers.onFinishExchange(messageId, entry.characterId, true)}>
                        Nada a trocar
                    </Button>
                ) : (
                    <Button type="button" size="sm" variant="secondary" disabled={handlers.busy} onClick={() => setConfirmFinish(true)}>
                        Concluir trocas
                    </Button>
                )}
            </div>
            <ConfirmDialog
                open={confirmFinish}
                onOpenChange={setConfirmFinish}
                title="Concluir as trocas?"
                description={`Depois de concluir, ${entry.name} não pede mais trocas neste descanso.`}
                confirmLabel="Concluir trocas"
                pending={handlers.busy}
                onConfirm={() => {
                    setConfirmFinish(false)
                    void handlers.onFinishExchange(messageId, entry.characterId, false)
                }}
            />
        </div>
    )
}
