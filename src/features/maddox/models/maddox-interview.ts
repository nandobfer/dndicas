import mongoose, { Schema, type Model, type Types } from "mongoose"
import type { AttributeType } from "@/features/character-sheets/types/character-sheet.types"
import { MADDOX_INTERVIEW_RUN_STATUSES, MADDOX_SCRIPT_KINDS, type MaddoxAbilityMethod, type MaddoxInterviewRunStatus, type MaddoxScriptKind } from "../constants"

/**
 * Entrevista do Maddox (Maddox 2) — `maddox_interviews`. Uma de cenário por campanha (com o dono) e uma
 * de personagem por membro. Guarda a conversa inteira (as respostas), a versão do roteiro com que
 * começou e o resultado consolidado ao concluir.
 */
export type MaddoxAbilityScores = Record<AttributeType, number>

/** Bônus do antecedente aplicado pelo Maddox (`parts`: +1/+2 por atributo, soma 3). */
export interface IMaddoxAbilityBonus {
    background: string
    parts: Partial<Record<AttributeType, number>>
}

/**
 * Card de atributos (Maddox 5) aberto pelo Maddox numa fala da entrevista. `pending` = aguardando o jogador;
 * `submitted` = enviado (travado); `superseded` = o Maddox reabriu num card mais novo. O valor final é sempre
 * derivado (`base` + `bonus`), nunca gravado.
 */
export interface IMaddoxAbilityScoresCard {
    status: "pending" | "submitted" | "superseded"
    method: MaddoxAbilityMethod | null
    base: MaddoxAbilityScores | null
    /** Valores do último envio quando o Maddox reabre o card. */
    prefill: { method: MaddoxAbilityMethod; base: MaddoxAbilityScores } | null
    bonus: IMaddoxAbilityBonus | null
    reason: string | null
    submittedAt: Date | null
}

/** Rolagens do método de rolagem (pertencem à entrevista: reabrir o card mantém os mesmos dados). */
export interface IMaddoxAbilityRolls {
    rolls: { dice: number[]; score: number; rollId: string }[]
    sixth: number | null
    /** A sexta pontuação ficou fora de 3–18: só "Reiniciar" continua. */
    invalid: boolean
}

/** Referência a uma entidade: id do catálogo (ou `null` quando é própria, só no Equilibrado) e o nome. */
export interface IMaddoxBuildRef {
    id: string | null
    name: string
}

/**
 * Povos (raças) e classes que existem no mundo da campanha (Maddox 8, cenário do Fiel ao D&D): só entidades do
 * catálogo. Lista vazia = todo o catálogo.
 */
export interface IMaddoxWorldCatalog {
    races: { id: string; name: string }[]
    classes: { id: string; name: string }[]
}

/**
 * Escolhas da ficha feitas na entrevista de personagem (graus com ficha), gravadas por `update_character_build` e
 * validadas contra o catálogo. A ficha é montada no servidor a partir delas (`sheet-builder.ts`).
 */
export interface IMaddoxExtraSpell {
    id: string
    name: string
    circle: number
    source: { kind: "race" | "feat"; id: string | null; name: string }
}

export interface IMaddoxCharacterBuild {
    level: number | null
    race: IMaddoxBuildRef | null
    class: IMaddoxBuildRef | null
    /** Id `subclass:{classe}:{subclasse}` (o mesmo da busca do catálogo). */
    subclass: IMaddoxBuildRef | null
    origin: IMaddoxBuildRef | null
    classSkills: string[]
    expertise: string[]
    fightingStyle: IMaddoxBuildRef | null
    feats: { level: number; id: string; name: string; attributes: Partial<Record<AttributeType, number>>; cap?: number }[]
    cantrips: IMaddoxBuildRef[]
    spells: IMaddoxBuildRef[]
    /**
     * DND-51: magias que não vêm da classe — da espécie ("Você sabe Rajada de Veneno") ou de um talento (os truques e a
     * magia do Iniciado em Magia) — com a fonte. Opcional: entrevistas antigas não têm.
     */
    extraSpells?: IMaddoxExtraSpell[]
    /** DND-51 (revisão, F7): espécie ou talento declarados sem magia (não cobram `magiasExtras`). */
    noExtraSpellSources?: string[]
    /** DND-51: atributo de conjuração escolhido pelo jogador (regra com lista, como espécie ou talento). */
    spellcastingAttribute?: AttributeType | null
    equipment: { id: string | null; name: string; quantity: number; equipped: boolean }[]
    coins: { cp: number; sp: number; ep: number; gp: number; pp: number }
    languages: string[]
    tools: string[]
}

/**
 * Card de pontos de vida por nível (personagem acima do nível 1), como o assistente de subir de nível da ficha: em cada
 * nível do 2 ao N, "média" ou "rolar" (1 dado de vida no servidor). Os ganhos sem CON ficam gravados; o total usa o CON
 * final.
 */
export interface IMaddoxHitPointsCard {
    status: "pending" | "submitted" | "superseded"
    level: number
    hitDie: string
    choices: Record<string, "average" | "roll"> | null
    reason: string | null
    submittedAt: Date | null
}

export interface IMaddoxInterviewMessage {
    id: string
    role: "maddox" | "user"
    content: string
    /** Mensagem do Maddox com a síntese final, aguardando "Confirmar e concluir". */
    proposal: boolean
    /** Falha do provedor ao gerar esta resposta ("Tentar de novo"). */
    error: string | null
    /** Fala do sistema (ex.: atributos enviados): vai ao modelo, nunca à tela. */
    internal?: boolean
    abilityScores?: IMaddoxAbilityScoresCard | null
    hitPoints?: IMaddoxHitPointsCard | null
    createdAt: Date
}

/**
 * Resposta do Personagem Opex aguardando o dono no modo ao vivo (DND-26). `kind` diz o que ela responde: uma fala do
 * Maddox (`content`), o card de atributos (`payload` = `{ method, scores }`) ou o card de PV (`payload` = `{ escolhas }`).
 */
export interface IMaddoxOpexDraft {
    id: string
    status: "generating" | "ready" | "failed"
    kind: "message" | "ability-scores" | "hit-points"
    content: string
    payload: Record<string, unknown> | null
    guidance: string | null
    error: string | null
    createdAt: Date
}

export interface IMaddoxInterview {
    _id: Types.ObjectId
    campaignId: Types.ObjectId
    kind: MaddoxScriptKind
    /** Membro entrevistado (personagem); `null` no cenário. */
    memberId: Types.ObjectId | null
    userId: string
    characterId: Types.ObjectId | null
    scriptVersion: number
    status: MaddoxInterviewRunStatus
    messages: IMaddoxInterviewMessage[]
    /** Trava de uma geração por vez (`token` de quem gera). */
    generating: { token: string; startedAt: Date } | null
    /** JSON consolidado gravado ao concluir (cenário ou perfil/ficha). */
    result: unknown
    abilityRolls?: IMaddoxAbilityRolls | null
    /** Escolhas da ficha (graus com ficha). */
    build?: IMaddoxCharacterBuild | null
    /** Povos e classes do mundo combinados na entrevista de cenário do Fiel ao D&D (Maddox 8). */
    world?: IMaddoxWorldCatalog | null
    /** Dados de vida rolados no card de PV (um por nível; reabrir o card mantém). */
    hitPointRolls?: { level: number; die: number; rollId: string }[] | null
    /** Resposta do Personagem Opex aguardando aprovação (modo ao vivo, DND-26). */
    opexDraft?: IMaddoxOpexDraft | null
    completedAt: Date | null
    createdAt: Date
    updatedAt: Date
}

const MessageSchema = new Schema<IMaddoxInterviewMessage>(
    {
        id: { type: String, required: true },
        role: { type: String, enum: ["maddox", "user"], required: true },
        content: { type: String, default: "" },
        proposal: { type: Boolean, default: false },
        error: { type: String, default: null },
        internal: { type: Boolean, default: undefined },
        abilityScores: { type: Schema.Types.Mixed, default: undefined },
        hitPoints: { type: Schema.Types.Mixed, default: undefined },
        createdAt: { type: Date, default: () => new Date() },
    },
    { _id: false },
)

const MaddoxInterviewSchema = new Schema<IMaddoxInterview>(
    {
        campaignId: { type: Schema.Types.ObjectId, ref: "MaddoxCampaign", required: true },
        kind: { type: String, enum: MADDOX_SCRIPT_KINDS, required: true },
        memberId: { type: Schema.Types.ObjectId, ref: "MaddoxCampaignMember", default: null },
        userId: { type: String, required: true },
        characterId: { type: Schema.Types.ObjectId, ref: "MaddoxCharacter", default: null },
        scriptVersion: { type: Number, required: true },
        status: { type: String, enum: MADDOX_INTERVIEW_RUN_STATUSES, default: "in-progress" },
        messages: { type: [MessageSchema], default: [] },
        generating: { type: new Schema({ token: String, startedAt: Date }, { _id: false }), default: null },
        result: { type: Schema.Types.Mixed, default: null },
        abilityRolls: { type: Schema.Types.Mixed, default: null },
        build: { type: Schema.Types.Mixed, default: null },
        world: { type: Schema.Types.Mixed, default: null },
        hitPointRolls: { type: Schema.Types.Mixed, default: null },
        opexDraft: { type: Schema.Types.Mixed, default: null },
        completedAt: { type: Date, default: null },
    },
    { collection: "maddox_interviews", timestamps: true, versionKey: false },
)

// Uma entrevista de cenário por campanha (memberId null) e uma de personagem por membro.
MaddoxInterviewSchema.index({ campaignId: 1, kind: 1, memberId: 1 }, { unique: true })

export const MaddoxInterviewModel: Model<IMaddoxInterview> = (mongoose.models.MaddoxInterview as Model<IMaddoxInterview>) || mongoose.model<IMaddoxInterview>("MaddoxInterview", MaddoxInterviewSchema)
