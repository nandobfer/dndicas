"use client"

import { useId, useState } from "react"
import { Plus, Trash2 } from "lucide-react"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { GlassButton } from "@/components/ui/glass-button"
import { GlassInput } from "@/components/ui/glass-input"
import { GlassSelector } from "@/components/ui/glass-selector"
import {
  ARMOR_CLASS_BONUS_DURATION_LABELS,
  ARMOR_CLASS_BONUS_MOMENT_MAX,
  ARMOR_CLASS_BONUS_NAME_MAX,
  ARMOR_CLASS_BONUS_ORIGIN_LABELS,
  ARMOR_CLASS_BONUS_ORIGINS,
  ARMOR_CLASS_BONUS_VALUE_MAX,
  ARMOR_CLASS_BONUS_VALUE_MIN,
  ARMOR_CLASS_BONUSES_MAX,
  armorClassBonusDurationText,
  findArmorClassBonus,
  readArmorClassBonuses,
  signedValue,
  type ArmorClassBonus,
  type ArmorClassBonusOrigin,
} from "../utils/armor-class-bonuses"

/** Durações que o jogador escolhe na ficha (as do combate tático só o Maddox grava). */
const PLAYER_DURATIONS = ["permanent", "short-rest", "long-rest", "moment"] as const
type PlayerDuration = (typeof PLAYER_DURATIONS)[number]

const ORIGIN_OPTIONS = ARMOR_CLASS_BONUS_ORIGINS.map((value) => ({ value, label: ARMOR_CLASS_BONUS_ORIGIN_LABELS[value] }))
const DURATION_OPTIONS = PLAYER_DURATIONS.map((value) => ({ value, label: ARMOR_CLASS_BONUS_DURATION_LABELS[value] }))

interface Props {
  bonuses: readonly ArmorClassBonus[] | null | undefined
  isReadOnly?: boolean
  onChange: (bonuses: ArmorClassBonus[]) => void
}

const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `b-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`)

/** Bônus de CA nomeados da ficha (DND-66): lista com remover e o formulário de acrescentar. */
export function ArmorClassBonusesEditor({ bonuses, isReadOnly = false, onChange }: Props) {
  const list = readArmorClassBonuses(bonuses)
  const [name, setName] = useState("")
  const [value, setValue] = useState("1")
  const [origin, setOrigin] = useState<ArmorClassBonusOrigin>("other")
  const [duration, setDuration] = useState<PlayerDuration>("permanent")
  const [moment, setMoment] = useState("")
  const [removing, setRemoving] = useState<ArmorClassBonus | null>(null)
  const ids = useId()

  const parsedValue = Number.parseInt(value, 10)
  const trimmedName = name.trim()
  const error = !trimmedName
    ? null
    : findArmorClassBonus(list, trimmedName)
      ? "Já existe um bônus com este nome."
      : !Number.isFinite(parsedValue) || parsedValue === 0 || parsedValue < ARMOR_CLASS_BONUS_VALUE_MIN || parsedValue > ARMOR_CLASS_BONUS_VALUE_MAX
        ? `O valor vai de ${ARMOR_CLASS_BONUS_VALUE_MIN} a +${ARMOR_CLASS_BONUS_VALUE_MAX} e não pode ser 0.`
        : duration === "moment" && !moment.trim()
          ? "Diga até quando o bônus vale."
          : null
  const canAdd = !isReadOnly && Boolean(trimmedName) && !error && list.length < ARMOR_CLASS_BONUSES_MAX

  const add = () => {
    if (!canAdd) return
    const bonus: ArmorClassBonus = {
      id: newId(),
      name: trimmedName.slice(0, ARMOR_CLASS_BONUS_NAME_MAX),
      value: parsedValue,
      origin,
      duration: duration === "moment" ? { kind: "moment", moment: moment.trim().slice(0, ARMOR_CLASS_BONUS_MOMENT_MAX) } : { kind: duration },
      addedBy: "player",
      createdAt: new Date().toISOString(),
    }
    onChange([...list, bonus])
    setName("")
    setValue("1")
    setMoment("")
  }

  return (
    <div className="space-y-3" data-testid="armor-class-bonuses-editor">
      <div>
        <p className="text-sm font-black uppercase tracking-[0.22em] text-white/80">Bônus de CA</p>
        <p className="mt-1 text-xs text-white/45">Cada bônus soma à CA com o próprio nome (magias, itens, cobertura…).</p>
      </div>
      {list.length ? (
        <ul className="space-y-1.5" aria-label="Bônus de CA">
          {list.map((bonus) => (
            <li key={bonus.id} className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5">
              <span className="w-9 shrink-0 text-center text-sm font-bold text-emerald-300">{signedValue(bonus.value)}</span>
              <div className="min-w-0 flex-1">
                <p className="break-words text-sm text-white">{bonus.name}</p>
                <p className="text-[11px] text-white/50">
                  {ARMOR_CLASS_BONUS_ORIGIN_LABELS[bonus.origin]} · {armorClassBonusDurationText(bonus.duration)}
                  {bonus.addedBy === "maddox" ? " · pelo Maddox" : ""}
                </p>
              </div>
              {!isReadOnly && (
                <GlassButton type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label={`Remover ${bonus.name}`} onClick={() => setRemoving(bonus)}>
                  <Trash2 className="h-4 w-4" aria-hidden />
                </GlassButton>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-white/45">Nenhum bônus de CA.</p>
      )}
      {!isReadOnly && (
        <div className="space-y-2 rounded-lg border border-white/10 bg-white/[0.02] p-3">
          <div className="grid grid-cols-[1fr_5rem] gap-2">
            <GlassInput id={`${ids}-name`} label="Nome do bônus" value={name} maxLength={ARMOR_CLASS_BONUS_NAME_MAX} onChange={(event) => setName(event.target.value)} placeholder="Escudo da Fé" />
            <GlassInput id={`${ids}-value`} label="Valor" type="number" min={ARMOR_CLASS_BONUS_VALUE_MIN} max={ARMOR_CLASS_BONUS_VALUE_MAX} value={value} onChange={(event) => setValue(event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <p className="text-[9px] font-black uppercase tracking-widest text-white/40">Origem</p>
            <GlassSelector<ArmorClassBonusOrigin> value={origin} onChange={(next) => setOrigin((Array.isArray(next) ? next[0] : next) ?? "other")} options={ORIGIN_OPTIONS} mode="single" layout="grid" cols={3} smCols={5} fullWidth size="sm" />
          </div>
          <div className="space-y-1.5">
            <p className="text-[9px] font-black uppercase tracking-widest text-white/40">Duração</p>
            <GlassSelector<PlayerDuration> value={duration} onChange={(next) => setDuration((Array.isArray(next) ? next[0] : next) ?? "permanent")} options={DURATION_OPTIONS} mode="single" layout="grid" cols={2} smCols={2} fullWidth size="sm" />
          </div>
          {duration === "moment" && <GlassInput id={`${ids}-moment`} label="Até quando" value={moment} maxLength={ARMOR_CLASS_BONUS_MOMENT_MAX} onChange={(event) => setMoment(event.target.value)} placeholder="o fim da cena" />}
          {error && (
            <p className="text-xs text-red-300" role="alert">
              {error}
            </p>
          )}
          {list.length >= ARMOR_CLASS_BONUSES_MAX && <p className="text-xs text-amber-200">Limite de {ARMOR_CLASS_BONUSES_MAX} bônus atingido.</p>}
          <GlassButton type="button" size="sm" onClick={add} disabled={!canAdd}>
            <Plus className="mr-1 h-4 w-4" aria-hidden /> Acrescentar bônus
          </GlassButton>
        </div>
      )}
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={`Remover ${removing?.name ?? "o bônus"}?`}
        description="A CA da ficha deixa de somar este bônus."
        confirmText="Remover"
        variant="danger"
        onConfirm={() => {
          if (removing) onChange(list.filter((bonus) => bonus.id !== removing.id))
          setRemoving(null)
        }}
      />
    </div>
  )
}
