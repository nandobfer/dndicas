import * as React from "react"
import { RulePreview, TraitPreview } from "@/features/rules/components/entity-preview-tooltip"
import { FeatPreview } from "@/features/feats/components/feat-preview"
import { SpellPreview } from "@/features/spells/components/spell-preview"

/**
 * Registry of renderers for different entity types.
 * T042: Shared entity renderer configuration for EntityList and GlassWindow.
 */
export const ENTITY_RENDERERS: Record<string, (item: any) => React.ReactNode> = {
    Regra: (item) => <RulePreview rule={item} showStatus={false} />,
    Habilidade: (item) => <TraitPreview trait={item} showStatus={false} />,
    Talento: (item) => <FeatPreview feat={item} showStatus={false} />,
    Magia: (item) => <SpellPreview spell={item} showStatus={false} />,
}

export const renderEntity = (item: any, entityType: string) => {
    const type = entityType === "Mixed" ? item.type : entityType
    const renderer = ENTITY_RENDERERS[type]
    return renderer ? renderer(item) : <div>{item.name || "Unknown item"}</div>
}
