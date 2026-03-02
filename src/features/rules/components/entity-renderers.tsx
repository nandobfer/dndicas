import * as React from "react"
import { RulePreview, TraitPreview } from "@/features/rules/components/entity-preview-tooltip"
import { FeatPreview } from "@/features/feats/components/feat-preview"
import { SpellPreview } from "@/features/spells/components/spell-preview"
import { ClassPreview } from "@/features/classes/components/class-preview"
import { fetchTraitById } from "@/features/traits/api/traits-api"
import { LoadingState } from "@/components/ui/loading-state"

/**
 * Registry of renderers for different entity types.
 * T042: Shared entity renderer configuration for EntityList and GlassWindow.
 */
export const ENTITY_RENDERERS: Record<string, (item: any) => React.ReactNode> = {
    Regra: (item) => <RulePreview rule={item} showStatus={false} />,
    Habilidade: (id) => <TraitAsyncRenderer id={id} />,
    Talento: (item) => <FeatPreview feat={item} showStatus={false} />,
    Magia: (item) => <SpellPreview spell={item} showStatus={false} />,
    Classe: (item) => <ClassPreview characterClass={item} showStatus={false} />,
}

function TraitAsyncRenderer({ id }: { id: string }) {
    const [trait, setTrait] = React.useState<any>(null)
    const [loading, setLoading] = React.useState(true)

    React.useEffect(() => {
        if (typeof id !== "string") {
            setTrait(id)
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
            <TraitPreview trait={trait} showStatus={true} />
        </div>
    )
}

export const renderEntity = (item: any, entityType: string) => {
    const type = entityType === "Mixed" ? item.type : entityType
    const renderer = ENTITY_RENDERERS[type]
    return renderer ? renderer(item) : <div>{item.name || "Unknown item"}</div>
}
