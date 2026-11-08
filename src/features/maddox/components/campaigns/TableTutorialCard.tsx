"use client"

import { useState, type ReactNode } from "react"
import { AnimatePresence, motion, useReducedMotion, type Variants } from "framer-motion"
import { ArrowRight, ArrowUp, ChevronDown, Dices, MinusCircle, Eye, Flag, HelpCircle, Keyboard, Lightbulb, MessageCircle, RefreshCw, Sparkles, UserPlus, Users, type LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/opex/button"
import { GlassCard as Card, GlassCardContent as CardContent, GlassCardDescription as CardDescription, GlassCardHeader as CardHeader, GlassCardTitle as CardTitle } from "@/components/ui/glass-card"
import { rarityColors } from "@/lib/config/colors"
import { cn } from "@/lib/utils"
import { MADDOX_REMINDER_MAX_CHARS } from "../../constants"
import type { MaddoxCampaignDetailDto } from "../../campaign-types"
import type { MaddoxSceneImageControlDto } from "../../game-types"
import { AskMasterButton, DeclareButton, PassTurnButton } from "../game/composer-buttons"
import { InjectReminderButton } from "../game/InjectReminderButton"
import { SceneImageButton } from "../game/SceneImageButton"
import { JournalLinkButton } from "../journal/JournalLinkButton"
import { RarityChip } from "./campaign-visuals"

const EASE = [0.22, 1, 0.36, 1] as const

const STEPS: readonly { title: string; text: string; icon: LucideIcon; color: string }[] = [
    { title: "O Maddox narra", text: "No turno do mestre, o Maddox abre a cena e conta o que acontece.", icon: Dices, color: rarityColors.rare },
    { title: "Cada jogador declara", text: "Na sua vez, diga o que o seu personagem faz, fala ou pretende — ou passe a vez.", icon: MessageCircle, color: rarityColors.veryRare },
    { title: "O Maddox resolve", text: "Com todos que estão na mesa decididos, ele resolve testes e consequências e narra o resultado.", icon: Sparkles, color: rarityColors.legendary },
]

const TIPS: readonly { text: string; icon: LucideIcon; color: string }[] = [
    { text: "Perguntas ao mestre não encerram o seu turno — dá para perguntar mesmo depois de declarar.", icon: HelpCircle, color: rarityColors.rare },
    { text: "A declaração é final: uma por turno. Pense na intenção antes de enviar.", icon: Flag, color: rarityColors.veryRare },
    { text: "O turno fecha quando todos os jogadores com a mesa aberta declararam ou passaram. Quem está offline não trava a mesa.", icon: Users, color: rarityColors.uncommon },
    { text: "Quem entra ou conclui a entrevista no meio do turno joga a partir do próximo.", icon: UserPlus, color: rarityColors.legendary },
    { text: `A lembrança (até ${MADDOX_REMINDER_MAX_CHARS} caracteres) não é uma ação do personagem: é um recado que o Maddox considera na próxima narração.`, icon: Lightbulb, color: rarityColors.legendary },
    { text: "O Diário guarda só o que os jogadores sabem: histórico, NPCs, locais, missões e a busca.", icon: Eye, color: rarityColors.rare },
]

/** Controle de demonstração do "Gerar imagem da cena" (só aparece ao dono). */
const DEMO_SCENE_IMAGE: MaddoxSceneImageControlDto = { owner: true, canRequest: true, reason: null, generating: false, remainingToday: 0, campaignEnabled: true, canRequestPortrait: false }
const noop = () => undefined
const noopAsync = async () => undefined

/** Moldura dos botões reais em demonstração: aparência de ativos, mas sem foco, clique ou teclado. */
function DemoFrame({ children, className, testId }: { children: ReactNode; className?: string; testId: string }) {
    return (
        <div inert aria-hidden className={cn("pointer-events-none select-none", className)} data-testid={testId}>
            {children}
        </div>
    )
}

/**
 * Tutorial da mesa na página da campanha (DND-37): aparece com o cenário pronto e enquanto o Maddox não registrou a
 * situação atual. Explica o ciclo do turno e mostra os botões reais da mesa em demonstração.
 */
export function TableTutorialCard({ campaign, color, footer }: { campaign: MaddoxCampaignDetailDto; color: string; footer?: ReactNode }) {
    const reduceMotion = useReducedMotion()
    const [open, setOpen] = useState(false)
    const isOwner = campaign.myRole === "owner"

    const list: Variants = { hidden: {}, show: { transition: { staggerChildren: reduceMotion ? 0 : 0.08, delayChildren: reduceMotion ? 0 : 0.05 } } }
    const item: Variants = reduceMotion
        ? { hidden: { opacity: 0 }, show: { opacity: 1, transition: { duration: 0 } } }
        : { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE } } }
    const hover = reduceMotion ? undefined : { y: -2 }

    return (
        <Card animate={false} className="relative overflow-hidden" data-testid="table-tutorial">
            <div className="pointer-events-none absolute inset-0" style={{ background: `radial-gradient(circle at 0% 0%, ${color}33, transparent 55%), radial-gradient(circle at 100% 100%, ${rarityColors.veryRare}1f, transparent 50%)` }} aria-hidden />
            <CardHeader className="relative">
                <CardTitle className="flex flex-wrap items-center gap-2.5 text-base">
                    <motion.span
                        className="flex h-9 w-9 items-center justify-center rounded-full border"
                        style={{ color, borderColor: `${color}66`, backgroundColor: `${color}1f` }}
                        animate={reduceMotion ? undefined : { boxShadow: [`0 0 0px ${color}00`, `0 0 22px ${color}66`, `0 0 0px ${color}00`] }}
                        transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
                        aria-hidden
                    >
                        <Sparkles className="h-4 w-4" />
                    </motion.span>
                    Como funciona a mesa
                    <RarityChip color={color}>Antes do primeiro turno</RarityChip>
                </CardTitle>
                <CardDescription>O cenário está pronto. Veja como os turnos e os controles funcionam antes da primeira narração.</CardDescription>
            </CardHeader>

            <CardContent className="relative space-y-6">
                <motion.section variants={list} initial="hidden" animate="show" aria-labelledby="tutorial-turnos" className="space-y-3">
                    <h3 id="tutorial-turnos" className="text-[11px] font-semibold uppercase tracking-wider text-white/60">
                        O ciclo do turno
                    </h3>
                    <ol className="grid gap-3 md:grid-cols-3" aria-label="Etapas do turno">
                        {STEPS.map((step, index) => {
                            const Icon = step.icon
                            return (
                                <motion.li
                                    key={step.title}
                                    variants={item}
                                    whileHover={hover}
                                    className="relative rounded-xl border bg-white/[0.03] p-4"
                                    style={{ borderColor: `${step.color}40`, background: `linear-gradient(160deg, ${step.color}1f, transparent 65%)` }}
                                    data-testid="tutorial-step"
                                >
                                    <div className="mb-2 flex items-center gap-2">
                                        <span className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-black" style={{ backgroundColor: step.color }} aria-hidden>
                                            {index + 1}
                                        </span>
                                        <Icon className="h-4 w-4" style={{ color: step.color }} aria-hidden />
                                        <p className="text-sm font-semibold text-white">{step.title}</p>
                                    </div>
                                    <p className="text-sm leading-relaxed text-white/70">{step.text}</p>
                                    {index < STEPS.length - 1 && (
                                        <motion.span
                                            className="absolute -right-2.5 top-1/2 z-10 hidden -translate-y-1/2 rounded-full border border-white/10 bg-background p-0.5 md:block"
                                            animate={reduceMotion ? undefined : { x: [0, 3, 0] }}
                                            transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
                                            aria-hidden
                                        >
                                            <ArrowRight className="h-3.5 w-3.5 text-white/60" />
                                        </motion.span>
                                    )}
                                </motion.li>
                            )
                        })}
                    </ol>
                    <motion.p variants={item} className="flex items-center gap-2 text-xs text-white/60">
                        <motion.span animate={reduceMotion ? undefined : { rotate: 360 }} transition={{ duration: 6, repeat: Infinity, ease: "linear" }} className="inline-flex" aria-hidden>
                            <RefreshCw className="h-3.5 w-3.5" style={{ color }} />
                        </motion.span>
                        E o ciclo recomeça: cada narração abre um novo turno dos jogadores.
                    </motion.p>
                </motion.section>

                <motion.section variants={list} initial="hidden" animate="show" aria-labelledby="tutorial-campo" className="space-y-3">
                    <h3 id="tutorial-campo" className="text-[11px] font-semibold uppercase tracking-wider text-white/60">
                        Na sua vez
                    </h3>
                    <motion.div variants={item} className="rounded-xl border border-white/10 bg-black/20 p-3">
                        <div className="flex items-center gap-2 rounded-xl border bg-card px-3 py-2 shadow-sm" style={{ borderColor: `${color}55` }}>
                            <span className="flex-1 truncate text-sm text-muted-foreground" aria-hidden>
                                O que o seu personagem faz?
                            </span>
                            <DemoFrame className="flex items-center gap-2" testId="tutorial-demo-composer">
                                <AskMasterButton />
                                <PassTurnButton />
                                <DeclareButton type="button" />
                            </DemoFrame>
                        </div>
                        <ul className="mt-3 grid gap-2 sm:grid-cols-3" aria-label="Botões do campo da mesa">
                            <ControlHint icon={HelpCircle} color={rarityColors.rare} title="Perguntar ao mestre" text="Tira uma dúvida sobre a cena. Não encerra o seu turno." variants={item} />
                            <ControlHint icon={MinusCircle} color={rarityColors.common} title="Não fazer nada" text="Passa a sua vez neste turno." variants={item} />
                            <ControlHint icon={ArrowUp} color={color} title="Declarar" text="Envia o que o seu personagem faz, diz ou pretende." variants={item} />
                        </ul>
                    </motion.div>
                </motion.section>

                <motion.section variants={list} initial="hidden" animate="show" aria-labelledby="tutorial-ferramentas" className="space-y-3">
                    <h3 id="tutorial-ferramentas" className="text-[11px] font-semibold uppercase tracking-wider text-white/60">
                        Ferramentas da mesa
                    </h3>
                    <ul className={cn("grid gap-3", isOwner ? "md:grid-cols-3" : "md:grid-cols-2")} aria-label="Ferramentas da mesa">
                        <ToolCard variants={item} hover={hover} color={rarityColors.legendary} title="Injetar Lembrança" text={`Lembre o Maddox de algo que ele deve considerar agora (até ${MADDOX_REMINDER_MAX_CHARS} caracteres).`}>
                            <DemoFrame testId="tutorial-demo-reminder">
                                <InjectReminderButton blockReason={null} sending={false} onSend={noopAsync} />
                            </DemoFrame>
                        </ToolCard>
                        <ToolCard variants={item} hover={hover} color={rarityColors.rare} title="Diário" text="Histórico, NPCs, locais, missões e a busca — só o que os jogadores sabem.">
                            <DemoFrame testId="tutorial-demo-journal">
                                <JournalLinkButton campaignId={campaign.id} data-testid="tutorial-journal-link" />
                            </DemoFrame>
                        </ToolCard>
                        {isOwner && (
                            <ToolCard variants={item} hover={hover} color={rarityColors.veryRare} title="Gerar imagem da cena" text="Só o dono, quando o Gerador de imagens estiver configurado. Há um limite por dia.">
                                <DemoFrame testId="tutorial-demo-scene-image">
                                    <SceneImageButton control={DEMO_SCENE_IMAGE} busy={false} onRequest={noop} />
                                </DemoFrame>
                            </ToolCard>
                        )}
                    </ul>
                </motion.section>

                <div className="space-y-2">
                    <Button type="button" size="sm" variant="ghost" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-controls="tutorial-extras">
                        <ChevronDown className={cn("transition-transform duration-300", open && "rotate-180")} aria-hidden /> {open ? "Mostrar menos" : "Ver mais dicas"}
                    </Button>
                    <AnimatePresence initial={false}>
                        {open && (
                            <motion.div
                                key="extras"
                                id="tutorial-extras"
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: reduceMotion ? 0 : 0.4, ease: EASE }}
                                className="overflow-hidden"
                                data-testid="tutorial-extras"
                            >
                                <motion.div variants={list} initial="hidden" animate="show" className="space-y-4 pt-1">
                                    <ul className="grid gap-2 sm:grid-cols-2" aria-label="Dicas da mesa">
                                        {TIPS.map((tip) => {
                                            const Icon = tip.icon
                                            return (
                                                <motion.li key={tip.text} variants={item} className="flex items-start gap-2.5 rounded-lg border border-white/10 bg-white/[0.03] p-3 text-sm text-white/75">
                                                    <Icon className="mt-0.5 h-4 w-4 shrink-0" style={{ color: tip.color }} aria-hidden />
                                                    {tip.text}
                                                </motion.li>
                                            )
                                        })}
                                    </ul>
                                    <motion.div variants={item} className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-white/10 bg-white/[0.03] p-3 text-sm text-white/75" data-testid="tutorial-shortcuts">
                                        <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/60">
                                            <Keyboard className="h-3.5 w-3.5" aria-hidden /> Atalhos
                                        </span>
                                        <span className="flex items-center gap-1.5">
                                            <Kbd>Enter</Kbd> declara
                                        </span>
                                        <span className="flex items-center gap-1.5">
                                            <Kbd>Shift</Kbd>+<Kbd>Enter</Kbd> quebra a linha
                                        </span>
                                    </motion.div>
                                </motion.div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {footer}
            </CardContent>
        </Card>
    )
}

function ControlHint({ icon: Icon, color, title, text, variants }: { icon: LucideIcon; color: string; title: string; text: string; variants: Variants }) {
    return (
        <motion.li variants={variants} className="rounded-lg border bg-white/[0.02] px-3 py-2" style={{ borderColor: `${color}33` }}>
            <p className="flex items-center gap-1.5 text-xs font-semibold" style={{ color }}>
                <Icon className="h-3.5 w-3.5" aria-hidden /> {title}
            </p>
            <p className="mt-0.5 text-xs text-white/65">{text}</p>
        </motion.li>
    )
}

function ToolCard({ color, title, text, children, variants, hover }: { color: string; title: string; text: string; children: ReactNode; variants: Variants; hover: { y: number } | undefined }) {
    return (
        <motion.li variants={variants} whileHover={hover} className="flex flex-col gap-2.5 rounded-xl border p-3" style={{ borderColor: `${color}40`, background: `linear-gradient(160deg, ${color}1a, transparent 70%)` }} data-testid="tutorial-tool">
            {children}
            <div>
                <p className="text-sm font-semibold text-white">{title}</p>
                <p className="text-xs leading-relaxed text-white/65">{text}</p>
            </div>
        </motion.li>
    )
}

function Kbd({ children }: { children: ReactNode }) {
    return <kbd className="rounded border border-white/20 bg-white/10 px-1.5 py-0.5 font-mono text-[11px] text-white">{children}</kbd>
}

