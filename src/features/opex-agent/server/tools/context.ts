import { z } from "zod"
import dbConnect from "@/core/database/db"
import { Reference } from "@/core/database/models/reference"
import { BackgroundModel } from "@/features/backgrounds/models/background"
import { CharacterClass } from "@/features/classes/models/character-class"
import { Feat } from "@/features/feats/models/feat"
import { ItemModel } from "@/features/items/database/item"
import { MonsterModel } from "@/features/monsters/models/monster"
import { RaceModel } from "@/features/races/models/race"
import { Spell } from "@/features/spells/models/spell"
import { Trait } from "@/features/traits/database/trait"
import { APP_VERSION } from "@/lib/config/version"
import { actorNameOf, roleOf } from "../scope"
import { defineTool, toolErrorMessage } from "./define"

const TIME_ZONE = "America/Sao_Paulo"

export function nowContext(now = new Date()) {
    return {
        iso: now.toISOString(),
        local: new Intl.DateTimeFormat("pt-BR", { dateStyle: "full", timeStyle: "short", timeZone: TIME_ZONE }).format(now),
        timeZone: TIME_ZONE,
    }
}

const ROLE_LABELS = { admin: "administrador", user: "usuário logado", anonymous: "visitante (sem login)" } as const

type Countable = { countDocuments(filter: Record<string, unknown>): Promise<number> }

const COUNTED: ReadonlyArray<[string, Countable]> = [
    ["Magia", Spell as unknown as Countable],
    ["Classe", CharacterClass as unknown as Countable],
    ["Raça", RaceModel as unknown as Countable],
    ["Origem", BackgroundModel as unknown as Countable],
    ["Talento", Feat as unknown as Countable],
    ["Habilidade", Trait as unknown as Countable],
    ["Item", ItemModel as unknown as Countable],
    ["Monstro", MonsterModel as unknown as Countable],
    ["Regra", Reference as unknown as Countable],
]

export const contextTools = [
    defineTool({
        name: "get_app_overview",
        group: "context",
        label: "Visão geral",
        risk: "read",
        description: "Retrato do DnDicas agora: data/hora, versão, quem está conversando (e o papel) e quantas entidades ativas há em cada tipo do catálogo. Bom primeiro passo quando o pedido for amplo.",
        input: z.object({}),
        execute: async (_input, context) => {
            let catalog: Record<string, number> | { error: string }
            try {
                await dbConnect()
                const counts = await Promise.all(COUNTED.map(async ([type, model]) => [type, await model.countDocuments({ status: "active" })] as const))
                catalog = Object.fromEntries(counts)
            } catch (error) {
                catalog = { error: toolErrorMessage(error) }
            }
            const role = roleOf(context.scope)
            return { now: nowContext(), app: "DnDicas", version: APP_VERSION, talkingTo: { name: actorNameOf(context.scope), role, roleLabel: ROLE_LABELS[role] }, catalog }
        },
    }),
]
