import type { CreateRaceInput, Race, RaceTrait, RaceVariation, SizeCategory } from "@/features/races/types/races.types"
import type { CreateSpellInput, Spell } from "@/features/spells/types/spells.types"
import type { CreateFeatInput, Feat } from "@/features/feats/types/feats.types"
import type { CreateMonsterInput, Monster } from "@/features/monsters/types/monsters.types"

export type EntityGenerationKind = "race" | "spell" | "feat" | "monster"

export interface EntityGenerationProgress {
    current: number
    total: number
    message: string
}

export interface RawGenerationSpellRef {
    _raw: true
    name: string
    originalName: string
    level: number
    source?: string
    circle?: number
    createInput?: CreateSpellInput
    requiresManualReview?: boolean
}

export interface GeneratedRaceTrait extends RaceTrait {
    originalName?: string
}

export interface GeneratedRaceVariation extends Omit<RaceVariation, "traits" | "spells"> {
    traits: GeneratedRaceTrait[]
    spells: RawGenerationSpellRef[]
}

export interface GeneratedRaceCandidate extends Omit<CreateRaceInput, "traits" | "spells" | "variations"> {
    candidateId: string
    matchLabel: string
    traits: GeneratedRaceTrait[]
    spells: RawGenerationSpellRef[]
    variations: GeneratedRaceVariation[]
}

export interface RaceGenerationResponse {
    entityType: "race"
    current: Race
    candidates: GeneratedRaceCandidate[]
}

export interface RaceGenerationGenerateRequest {
    runId: string
}

export interface RaceGenerationGenerateResponse {
    current: Race
    candidates: GeneratedRaceCandidate[]
}

export interface RaceGenerationApplyRequest {
    candidate: GeneratedRaceCandidate
}

export interface RaceGenerationApplyResponse {
    race: Race
}

export interface GeneratedSpellCandidate extends CreateSpellInput {
    candidateId: string
    matchLabel: string
}

export interface SpellGenerationGenerateRequest {
    runId: string
}

export interface SpellGenerationGenerateResponse {
    current: Spell
    candidates: GeneratedSpellCandidate[]
}

export interface SpellGenerationApplyRequest {
    candidate: GeneratedSpellCandidate
}

export interface SpellGenerationApplyResponse {
    spell: Spell
}

export interface GeneratedFeatCandidate extends CreateFeatInput {
    candidateId: string
    matchLabel: string
}

export interface FeatGenerationGenerateRequest {
    runId: string
}

export interface FeatGenerationGenerateResponse {
    current: Feat
    candidates: GeneratedFeatCandidate[]
}

export interface FeatGenerationApplyRequest {
    candidate: GeneratedFeatCandidate
}

export interface FeatGenerationApplyResponse {
    feat: Feat
}

export interface GeneratedMonsterCandidate extends CreateMonsterInput {
    candidateId: string
    matchLabel: string
}

export interface MonsterGenerationGenerateRequest {
    runId: string
}

export interface MonsterGenerationGenerateResponse {
    current: Monster
    candidates: GeneratedMonsterCandidate[]
}

export interface MonsterGenerationApplyRequest {
    candidate: GeneratedMonsterCandidate
}

export interface MonsterGenerationApplyResponse {
    monster: Monster
}

export interface FiveEToolsGenerationRace {
    name: string
    source: string
    page?: number
    size?: string[]
    speed?: number | Record<string, number | boolean>
    entries?: FiveEToolsGenerationEntry[]
    reprintedAs?: string[]
    traitTags?: string[]
    additionalSpells?: AdditionalSpellGroup[]
}

export interface FiveEToolsGenerationSubrace {
    name?: string
    source: string
    raceName: string
    raceSource: string
    page?: number
    size?: string[]
    speed?: number | Record<string, number | boolean>
    entries?: FiveEToolsGenerationEntry[]
    reprintedAs?: string[]
    additionalSpells?: AdditionalSpellGroup[]
}

export interface FiveEToolsGenerationEntry {
    type?: string
    name?: string
    entries?: (string | FiveEToolsGenerationEntry)[]
    items?: (string | FiveEToolsGenerationEntry)[]
    entry?: string
    caption?: string
    colLabels?: string[]
    rows?: unknown[][]
}

export interface AdditionalSpellGroup {
    known?: Record<string, AdditionalSpellAtLevel>
    innate?: Record<string, AdditionalSpellAtLevel>
    ability?: string
}

export interface AdditionalSpellAtLevel {
    _?: (string | Record<string, unknown>)[]
    daily?: Record<string, (string | Record<string, unknown>)[]>
    will?: (string | Record<string, unknown>)[]
    rest?: Record<string, (string | Record<string, unknown>)[]>
}

export interface FiveEToolsGenerationSpell {
    name: string
    source: string
    page?: number
    level: number
    school: string
    time?: Array<{ number: number; unit: string; condition?: string }>
    range?: { type: string; distance?: { type: string; amount?: number } }
    components?: { v?: boolean; s?: boolean; m?: boolean | string }
    duration?: Array<{ type: string; concentration?: boolean; duration?: { type: string; amount?: number } }>
    entries?: (string | Record<string, unknown>)[]
    entriesHigherLevel?: Array<{ type: string; name: string; entries: string[] }>
    savingThrow?: string[]
    meta?: { ritual?: boolean }
}

export interface FluffGenerationRaceEntry {
    name: string
    source: string
    entries?: (string | FiveEToolsGenerationEntry)[]
    images?: Array<{
        type: string
        href: { type: "internal" | "external"; path?: string; url?: string }
    }>
}

export type GeneratedSizeCategory = SizeCategory
