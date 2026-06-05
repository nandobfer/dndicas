"use client"

import { ExternalLink, Eye, Footprints, HeartPulse, Languages, Shield, Skull, Swords } from "lucide-react"
import { motion } from "framer-motion"
import { useWindows } from "@/core/context/window-context"
import { Chip } from "@/components/ui/chip"
import { GlassImage } from "@/components/ui/glass-image"
import { MentionContent, EntityTitleLink } from "@/features/rules/components/mention-badge"
import { EntitySource } from "@/features/rules/components/entity-source"
import { entityColors, attributeColors, damageTypeColors } from "@/lib/config/colors"
import { cn } from "@/core/utils"
import type { Monster } from "../types/monsters.types"
import { formatMonsterHitPointAverage, formatSigned, getMonsterHitPointAverage, getMonsterPassivePerception, getMonsterProficiencyBonus, getMonsterSavingThrowBonus, getMonsterSkillBonus, getMonsterXp, isMonsterHitPointFormulaStatic } from "../utils/monster-calculations"
import { ALIGNMENT_LABELS, ATTRIBUTE_KEYS, ATTRIBUTE_LABELS, CONDITION_LABELS, MONSTER_SIZE_LABELS, MONSTER_TYPE_LABELS, SKILL_NAMES } from "./monster-options"
import { NpcParamPreview } from "./npc-param-preview"

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="space-y-2">
            <div className="text-[10px] font-bold uppercase tracking-widest text-white/35">{title}</div>
            {children}
        </div>
    )
}

function ParamList({ title, items }: { title: string; items?: Monster["actions"] }) {
    if (!items || items.length === 0) return null
    return (
        <Section title={title}>
            <div className="grid gap-2">{items.map((item, index) => <NpcParamPreview key={item._id || `${title}-${index}`} param={item} />)}</div>
        </Section>
    )
}

function SummaryCard({ icon, label, value, detail }: { icon: React.ReactNode; label: string; value: React.ReactNode; detail?: React.ReactNode }) {
    return (
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
            <div className="flex items-center gap-1.5 mb-1">
                {icon}
                <div className="text-[10px] text-white/35">{label}</div>
            </div>
            {detail ? (
                <div className="flex items-baseline gap-2">
                    <div className="text-lg font-bold text-white">{value}</div>
                    <div className="h-3 w-px bg-white/15" />
                    <div className="text-[10px] text-white/35">{detail}</div>
                </div>
            ) : (
                <div className="text-lg font-bold text-white">{value}</div>
            )}
        </div>
    )
}

function getDamageTypeLabel(value: keyof typeof damageTypeColors) {
    const label = damageTypeColors[value]?.keys[0] ?? value
    return label.charAt(0).toLocaleUpperCase("pt-BR") + label.slice(1)
}

export interface NpcPreviewProps {
    monster: Monster
    showStatus?: boolean
    hideStatusChip?: boolean
    hideActionIcons?: boolean
    /** Entity type used for title links and icon color. Default: "Monstro" */
    entityType?: keyof typeof entityColors
}

export function NpcPreview({ monster, showStatus = true, hideStatusChip = false, hideActionIcons = false, entityType = "Monstro" }: NpcPreviewProps) {
    const { addWindow } = useWindows()
    const colors = entityColors[entityType] ?? entityColors.Monstro
    const proficiencyBonus = getMonsterProficiencyBonus(monster.challengeRating, monster.proficiencyBonusOverride)
    const passivePerception = getMonsterPassivePerception(monster.attributes, monster.skills?.Percepção, proficiencyBonus, monster.senses?.passivePerception)
    const hitPointAverage = getMonsterHitPointAverage(monster.hitPointsFormula)
    const xp = getMonsterXp(monster.challengeRating, monster.experienceOverride)
    const speeds = [
        monster.speed,
        monster.flySpeed && `voo ${monster.flySpeed}`,
        monster.swimSpeed && `nado ${monster.swimSpeed}`,
        monster.climbSpeed && `escalada ${monster.climbSpeed}`,
    ].filter(Boolean)
    const legacySenses = [
        `percepção passiva ${passivePerception}`,
        monster.senses?.blindsight && `percepção às cegas ${monster.senses.blindsight}`,
        monster.senses?.darkvision && `visão no escuro ${monster.senses.darkvision}`,
        monster.senses?.tremorsense && `sentido sísmico ${monster.senses.tremorsense}`,
        monster.senses?.truesight && `visão verdadeira ${monster.senses.truesight}`,
        monster.senses?.special,
    ].filter(Boolean)

    const defenses = [
        { label: "Vulnerabilidades", values: monster.damageVulnerabilities },
        { label: "Resistências", values: monster.damageResistances },
        { label: "Imunidades", values: monster.damageImmunities },
    ].filter((item) => item.values?.length)

    return (
        <div className="space-y-5 w-full text-left">
            <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className={cn("p-1.5 rounded-lg border", colors.badge, colors.border)}>
                        <Skull className="h-4 w-4 text-red-300" />
                    </div>
                    <div>
                        <EntityTitleLink name={monster.name} entityType={entityType} entity={monster} className="text-base font-bold" style={{ color: colors.hex }} />
                        <p className="text-[10px] uppercase font-bold tracking-widest text-white/40 mt-0.5">
                            {MONSTER_TYPE_LABELS[monster.type]} {MONSTER_SIZE_LABELS[monster.size]}, {ALIGNMENT_LABELS[monster.alignment]}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {!hideActionIcons && (
                        <motion.button
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                            onClick={() => addWindow({ title: monster.name || entityType, content: null, item: monster, entityType })}
                            className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors"
                            title="Abrir em nova janela"
                        >
                            <ExternalLink className="h-4 w-4" />
                        </motion.button>
                    )}
                    {showStatus && !hideStatusChip && monster.status === "inactive" && <Chip variant="common" size="sm">Inativo</Chip>}
                </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                <SummaryCard icon={<Shield className="h-3 w-3 text-white/35" />} label="CA" value={monster.armorClass} />
                <SummaryCard
                    icon={<HeartPulse className="h-3 w-3 text-white/35" />}
                    label="PV"
                    value={hitPointAverage !== null ? formatMonsterHitPointAverage(hitPointAverage) : monster.hitPointsFormula}
                    detail={hitPointAverage !== null && !isMonsterHitPointFormulaStatic(monster.hitPointsFormula) ? monster.hitPointsFormula : undefined}
                />
                <SummaryCard icon={<Swords className="h-3 w-3 text-white/35" />} label="CR" value={monster.challengeRating} detail={`${xp.toLocaleString("pt-BR")} XP`} />
                <SummaryCard icon={<Footprints className="h-3 w-3 text-white/35" />} label="Velocidade" value={<span className="text-sm">{speeds.join(", ") || "—"}</span>} />
                <SummaryCard icon={<Eye className="h-3 w-3 text-white/35" />} label="Percepção passiva" value={passivePerception} />
            </div>

            <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                {ATTRIBUTE_KEYS.map((attribute) => {
                    const label = ATTRIBUTE_LABELS[attribute]
                    const mod = Math.floor((monster.attributes[attribute] - 10) / 2)
                    const color = attributeColors[label as keyof typeof attributeColors]
                    return (
                        <div key={attribute} className={cn("rounded-lg border p-2 text-center", color.border, color.bgAlpha)}>
                            <div className={cn("text-[10px] font-bold", color.text)}>{label}</div>
                            <div className="flex items-baseline justify-center gap-1">
                                <span className="text-base font-bold text-white">{formatSigned(mod)}</span>
                                <span className="text-[10px] text-white/45">({monster.attributes[attribute]})</span>
                            </div>
                        </div>
                    )
                })}
            </div>

            <div className="flex flex-col md:flex-row gap-6">
                <div className="flex-1 space-y-5">
                    <Section title="Descrição">
                        <MentionContent html={monster.description} mode="block" className="text-sm text-white/80 [&_p]:text-sm [&_p]:leading-relaxed" />
                    </Section>

                    <Section title="Salvaguardas e Perícias">
                        <div className="text-xs text-white/60">
                            <span className="font-bold text-white/80">Salvaguardas:</span>{" "}
                            {ATTRIBUTE_KEYS.filter((attribute) => monster.savingThrows?.[attribute]?.proficient || monster.savingThrows?.[attribute]?.override !== undefined)
                                .map((attribute) => `${ATTRIBUTE_LABELS[attribute]} ${formatSigned(getMonsterSavingThrowBonus(attribute, monster.attributes, monster.savingThrows?.[attribute], proficiencyBonus))}`)
                                .join(", ") || "—"}
                        </div>
                        <div className="text-xs text-white/60">
                            <span className="font-bold text-white/80">Perícias:</span>{" "}
                            {SKILL_NAMES.filter((skill) => monster.skills?.[skill]?.proficient || monster.skills?.[skill]?.expertise || monster.skills?.[skill]?.override !== undefined)
                                .map((skill) => `${skill} ${formatSigned(getMonsterSkillBonus(skill, monster.attributes, monster.skills?.[skill], proficiencyBonus))}`)
                                .join(", ") || "—"}
                        </div>
                    </Section>

                    {monster.sensesAndLanguages?.length > 0 ? (
                        <ParamList title="Sentidos e Idiomas" items={monster.sensesAndLanguages} />
                    ) : (
                        <Section title="Sentidos e Idiomas">
                            <div className="text-xs text-white/60">
                                <Eye className="inline h-3 w-3 mr-1 text-white/35" />
                                {legacySenses.join(", ") || "—"}
                            </div>
                            <div className="text-xs text-white/60"><Languages className="inline h-3 w-3 mr-1 text-white/35" />{monster.languages || "—"}</div>
                        </Section>
                    )}

                    {(defenses.length > 0 || monster.conditionImmunities.length > 0 || monster.conditionImmunityNotes) && (
                        <Section title="Defesas">
                            <div className="space-y-1 text-xs text-white/60">
                                {defenses.map((defense) => (
                                    <div key={defense.label}>
                                        <span className="font-bold text-white/80">{defense.label}:</span>{" "}
                                        {defense.values.map((value, index) => (
                                            <span key={value}>
                                                <span style={{ color: damageTypeColors[value]?.hex }}>{getDamageTypeLabel(value)}</span>
                                                {index < defense.values.length - 1 && <span className="text-white/35">, </span>}
                                            </span>
                                        ))}
                                    </div>
                                ))}
                                {monster.conditionImmunities.length > 0 && <div><span className="font-bold text-white/80">Condições:</span> {monster.conditionImmunities.map((item) => CONDITION_LABELS[item]).join(", ")}</div>}
                                {monster.conditionImmunityNotes && <MentionContent html={monster.conditionImmunityNotes} mode="block" className="text-xs text-white/60" />}
                            </div>
                        </Section>
                    )}
                </div>
                {monster.image && <div className="w-full md:w-[30%] shrink-0"><GlassImage src={monster.image} alt={monster.name} /></div>}
            </div>

            <ParamList title="Traços" items={monster.traits} />
            <ParamList title="Ações" items={monster.actions} />
            <ParamList title="Ações Bônus" items={monster.bonusActions} />
            <ParamList title="Reações" items={monster.reactions} />
            <ParamList title={`Ações Lendárias${monster.legendaryActionUses ? ` (${monster.legendaryActionUses}/rodada)` : ""}`} items={monster.legendaryActions} />
            <ParamList title={`Ações de Covil${monster.lairActionInitiative ? ` (iniciativa ${monster.lairActionInitiative})` : ""}`} items={monster.lairActions} />
            <ParamList title="Efeitos Regionais" items={monster.regionalEffects} />

            <EntitySource source={monster.source} originalName={monster.originalName} />
        </div>
    )
}
