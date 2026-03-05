import * as React from "react"
import { RulePreview, TraitPreview } from "@/features/rules/components/entity-preview-tooltip"
import { FeatPreview } from "@/features/feats/components/feat-preview"
import { SpellPreview } from "@/features/spells/components/spell-preview"
import { ClassPreview } from "@/features/classes/components/class-preview"
import { BackgroundPreview } from "@/features/backgrounds/components/background-preview"
import { fetchTraitById } from "@/features/traits/api/traits-api"
import { fetchSpell } from "@/features/spells/api/spells-api"
import { fetchFeat } from "@/features/feats/api/feats-api"
import { getClassById } from "@/features/classes/api/classes-service"
import { LoadingState } from "@/components/ui/loading-state"
import { Wand, GraduationCap, Star } from "lucide-react"

/**
 * Registry of renderers for different entity types.
 * T042: Shared entity renderer configuration for EntityList and GlassWindow.
 */
export const ENTITY_RENDERERS: Record<string, (item: any, options?: { showStatus?: boolean; hideStatusChip?: boolean; hideActionIcons?: boolean }) => React.ReactNode> = {
    Regra: (item, opts) => <RulePreview rule={item} showStatus={opts?.showStatus ?? false} />,
    Habilidade: (id, opts) => <TraitAsyncRenderer id={id} showStatus={opts?.showStatus ?? true} hideStatusChip={opts?.hideStatusChip} hideActionIcons={opts?.hideActionIcons} />,
    Talento: (idOrItem, opts) => <FeatAsyncRenderer item={idOrItem} showStatus={opts?.showStatus ?? true} hideStatusChip={opts?.hideStatusChip} hideActionIcons={opts?.hideActionIcons} />,
    Magia: (idOrItem, opts) => <SpellAsyncRenderer item={idOrItem} showStatus={opts?.showStatus ?? true} hideStatusChip={opts?.hideStatusChip} hideActionIcons={opts?.hideActionIcons} />,
    Classe: (idOrItem, opts) => <ClassAsyncRenderer item={idOrItem} showStatus={opts?.showStatus ?? true} />,
    Origem: (idOrItem, opts) => <BackgroundAsyncRenderer item={idOrItem} />,
}

function TraitAsyncRenderer({ id, showStatus = true, hideStatusChip, hideActionIcons }: { id: any; showStatus?: boolean; hideStatusChip?: boolean; hideActionIcons?: boolean }) {
    const [trait, setTrait] = React.useState<any>(null)
    const [loading, setLoading] = React.useState(true)

    React.useEffect(() => {
        if (id && typeof id === "object") {
            setTrait(id)
            setLoading(false)
            return
        }

        if (typeof id !== "string") {
            setTrait(null)
            setLoading(false)
            return
        }

        fetchTraitById(id)
            .then(setTrait)
            .catch(console.error)
            .finally(() => setLoading(false))
    }, [id])

    if (loading)
        return (
            <div className="p-4 flex justify-center">
                <LoadingState variant="spinner" size="sm" />
            </div>
        )
    if (!trait) return <div className="p-4 text-xs text-white/20 italic text-center">Habilidade não encontrada</div>

    return (
        <div className="p-4">
            <TraitPreview trait={trait} showStatus={showStatus} hideStatusChip={hideStatusChip} hideActionIcons={hideActionIcons} />
        </div>
    )
}

function SpellAsyncRenderer({ item, showStatus = true, hideStatusChip, hideActionIcons }: { item: any; showStatus?: boolean; hideStatusChip?: boolean; hideActionIcons?: boolean }) {
    const [spell, setSpell] = React.useState<any>(null)
    const [loading, setLoading] = React.useState(true)

    const id = typeof item === "string" ? item : item?._id || item?.id

    React.useEffect(() => {
        // Se já temos o objeto completo (com escola ou descrição), não precisamos buscar
        if (item && typeof item === "object" && (item.school || item.description)) {
            setSpell(item)
            setLoading(false)
            return
        }

        if (!id) {
            setLoading(false)
            return
        }

        fetchSpell(id)
            .then(setSpell)
            .catch(console.error)
            .finally(() => setLoading(false))
    }, [id, item])

    if (loading)
        return (
            <div className="p-8 flex flex-col items-center justify-center gap-3 bg-white/[0.02] rounded-xl border border-white/5 animate-in fade-in duration-300">
                <LoadingState variant="spinner" size="md" />
                <span className="text-[10px] uppercase font-bold tracking-widest text-white/20">Buscando Magia...</span>
            </div>
        )
    if (!spell)
        return (
            <div className="p-8 text-center bg-rose-500/5 rounded-xl border border-dashed border-rose-500/20 flex flex-col items-center justify-center gap-2">
                <div className="p-2 rounded-full bg-rose-500/10 text-rose-400">
                    <Wand className="h-4 w-4" />
                </div>
                <p className="text-xs text-rose-400/60 italic">Magia não encontrada no catálogo.</p>
            </div>
        )

    return (
        <div className="p-4">
            <SpellPreview spell={spell} showStatus={showStatus} hideStatusChip={hideStatusChip} hideActionIcons={hideActionIcons} />
        </div>
    )
}

function ClassAsyncRenderer({ item, showStatus = true }: { item: any; showStatus?: boolean }) {
    const [characterClass, setCharacterClass] = React.useState<any>(null)
    const [loading, setLoading] = React.useState(true)

    const id = typeof item === "string" ? item : item?._id || item?.id

    React.useEffect(() => {
        // Se já temos o objeto completo (com atributos primários ou subclasses), não precisamos buscar
        if (item && typeof item === "object" && (item.primaryAttributes?.length > 0 || item.subclasses?.length > 0)) {
            setCharacterClass(item)
            setLoading(false)
            return
        }

        if (!id) {
            setLoading(false)
            return
        }

        // Fetch via client-side API to get the full profile
        fetch(`/api/classes/${id}`)
            .then((res) => res.json())
            .then(setCharacterClass)
            .catch(console.error)
            .finally(() => setLoading(false))
    }, [id, item])

    if (loading)
        return (
            <div className="p-8 flex flex-col items-center justify-center gap-3 bg-white/[0.02] rounded-xl border border-white/5 animate-in fade-in duration-300">
                <LoadingState variant="spinner" size="md" />
                <span className="text-[10px] uppercase font-bold tracking-widest text-white/20">Buscando Classe...</span>
            </div>
        )
    if (!characterClass)
        return (
            <div className="p-8 text-center bg-blue-500/5 rounded-xl border border-dashed border-blue-500/20 flex flex-col items-center justify-center gap-2">
                <div className="p-2 rounded-full bg-blue-500/10 text-blue-400">
                    <GraduationCap className="h-4 w-4" />
                </div>
                <p className="text-xs text-blue-400/60 italic">Classe não encontrada no catálogo.</p>
            </div>
        )

    return (
        <div className="p-4">
            <ClassPreview characterClass={characterClass} showStatus={showStatus} />
        </div>
    )
}

function FeatAsyncRenderer({ item, showStatus = true, hideStatusChip, hideActionIcons }: { item: any; showStatus?: boolean; hideStatusChip?: boolean; hideActionIcons?: boolean }) {
    const [feat, setFeat] = React.useState<any>(null)
    const [loading, setLoading] = React.useState(true)

    const id = typeof item === "string" ? item : item?._id || item?.id

    React.useEffect(() => {
        // Se já temos o objeto completo, não precisamos buscar
        if (item && typeof item === "object" && item.description && item.name) {
            setFeat(item)
            setLoading(false)
            return
        }

        if (!id) {
            setLoading(false)
            return
        }

        fetchFeat(id)
            .then(setFeat)
            .catch(console.error)
            .finally(() => setLoading(false))
    }, [id, item])

    if (loading)
        return (
            <div className="p-8 flex flex-col items-center justify-center gap-3 bg-white/[0.02] rounded-xl border border-white/5 animate-in fade-in duration-300">
                <LoadingState variant="spinner" size="md" />
                <span className="text-[10px] uppercase font-bold tracking-widest text-white/20">Buscando Talento...</span>
            </div>
        )
    if (!feat)
        return (
            <div className="p-8 text-center bg-amber-500/5 rounded-xl border border-dashed border-amber-500/20 flex flex-col items-center justify-center gap-2">
                <div className="p-2 rounded-full bg-amber-500/10 text-amber-500">
                    <Star className="h-4 w-4" />
                </div>
                <p className="text-xs text-amber-500/60 italic">Talento não encontrado.</p>
            </div>
        )

    return (
        <div className="p-4">
            <FeatPreview feat={feat} showStatus={showStatus} hideStatusChip={hideStatusChip} hideActionIcons={hideActionIcons} />
        </div>
    )
}

function BackgroundAsyncRenderer({ item }: { item: any }) {
    const [background, setBackground] = React.useState<any>(null)
    const [loading, setLoading] = React.useState(true)

    const id = typeof item === "string" ? item : item?._id || item?.id

    React.useEffect(() => {
        // Se já temos o objeto completo, não precisamos buscar
        if (item && typeof item === "object" && item.description && (item.traits || item.skillProficiencies)) {
            setBackground(item)
            setLoading(false)
            return
        }

        if (!id) {
            setLoading(false)
            return
        }

        fetch(`/api/backgrounds/${id}`)
            .then((res) => res.json())
            .then(setBackground)
            .catch(console.error)
            .finally(() => setLoading(false))
    }, [id, item])

    if (loading)
        return (
            <div className="p-8 flex flex-col items-center justify-center gap-3 bg-white/[0.02] rounded-xl border border-white/5">
                <LoadingState variant="spinner" size="md" />
                <span className="text-[10px] uppercase font-bold tracking-widest text-white/20">Buscando Origem...</span>
            </div>
        )
    if (!background)
        return (
            <div className="p-8 text-center bg-blue-500/5 rounded-xl border border-dashed border-blue-500/20 flex flex-col items-center justify-center gap-2">
                <p className="text-xs text-blue-400/60 italic">Origem não encontrada.</p>
            </div>
        )

    return (
        <div className="p-6">
            <BackgroundPreview background={background} />
        </div>
    )
}


export const renderEntity = (item: any, entityType: string, options?: { showStatus?: boolean }) => {
    const type = entityType === "Mixed" ? item.type : entityType
    const renderer = ENTITY_RENDERERS[type]
    return renderer ? renderer(item, options) : <div>{item.name || "Unknown item"}</div>
}
