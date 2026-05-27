const PAGE_SUFFIX_REGEX = /\s+(?:p(?:á|a)?g?|p)\.?(?:\s*\d.*)?$/i
const PAGE_NUMBER_REGEX = /\s+(?:p(?:á|a)?g?|p)\.?\s*(\d+)\s*$/i

const SOURCE_CODE_DISPLAY_NAMES: Record<string, string> = {
    LDJ: "Livro do Jogador",
    PHB: "Livro do Jogador",
    XPHB: "Livro do Jogador",
    LDM: "Monster Manual",
    MM: "Monster Manual",
    XMM: "Monster Manual 2024",
    TCE: "Tasha's Cauldron of Everything",
    XGE: "Xanathar's Guide to Everything",
    DMG: "Dungeon Master's Guide",
    MTF: "Mordenkainen's Tome of Foes",
    MPMM: "Mordenkainen Presents: Monsters of the Multiverse",
    VGM: "Volo's Guide to Monsters",
    FTD: "Fizban's Treasury of Dragons",
    BGG: "Bigby Presents: Glory of the Giants",
    BMT: "The Book of Many Things",
    SCC: "Strixhaven: A Curriculum of Chaos",
    ERLW: "Eberron: Rising from the Last War",
    EGW: "Explorer's Guide to Wildemount",
    GGR: "Guildmasters' Guide to Ravnica",
    MOT: "Mythic Odysseys of Theros",
    VRGR: "Van Richten's Guide to Ravenloft",
    WBTW: "The Wild Beyond the Witchlight",
    AAG: "Astral Adventurer's Guide",
    DSOTDQ: "Dragonlance: Shadow of the Dragon Queen",
    SATO: "Sigil and the Outlands",
    EEPC: "Elemental Evil Player Companion",
    AI: "Acquisitions Incorporated",
    ABH: "Astarion's Book of Hungers",
    EFA: "Eberron: Forge of the Artificer",
    FRHOF: "Forgotten Realms: Heroes of Faerun",
    LFL: "Lorwyn: First Light",
    PSA: "Plane Shift: Amonkhet",
    PSD: "Plane Shift: Dominaria",
    PSI: "Plane Shift: Innistrad",
    PSK: "Plane Shift: Kaladesh",
    PSX: "Plane Shift: Ixalan",
    PSZ: "Plane Shift: Zendikar",
    TTP: "The Tortle Package",
    LR: "Locathah Rising",
    OGA: "One Grung Above",
    AWM: "Adventure with Muk",
}

const SOURCE_TEXT_ALIASES: Array<{ alias: string; displayName: string }> = [
    { alias: "Livro do Jogador", displayName: "Livro do Jogador" },
    { alias: "Manual do Jogador", displayName: "Livro do Jogador" },
    { alias: "Player's Handbook", displayName: "Livro do Jogador" },
    { alias: "Players Handbook", displayName: "Livro do Jogador" },
    { alias: "Player's Handbook 2024", displayName: "Livro do Jogador" },
    { alias: "Players Handbook 2024", displayName: "Livro do Jogador" },
    { alias: "Monster Manual", displayName: "Monster Manual" },
    { alias: "Manual dos Monstros", displayName: "Monster Manual" },
    { alias: "Livro dos Monstros", displayName: "Monster Manual" },
    { alias: "Monster Manual 2024", displayName: "Monster Manual 2024" },
]

const normalizeSourceToken = (value: string): string =>
    value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[’']/g, "")
        .replace(/[^a-zA-Z0-9]+/g, " ")
        .trim()
        .toLowerCase()

const TEXT_ALIAS_TO_DISPLAY_NAME = SOURCE_TEXT_ALIASES.reduce<Record<string, string>>((acc, entry) => {
    acc[normalizeSourceToken(entry.alias)] = entry.displayName
    return acc
}, {})

const DISPLAY_NAME_TO_ALIASES = SOURCE_TEXT_ALIASES.reduce<Record<string, string[]>>((acc, entry) => {
    const currentAliases = acc[entry.displayName] ?? []
    acc[entry.displayName] = currentAliases.includes(entry.alias) ? currentAliases : [...currentAliases, entry.alias]
    return acc
}, {})

const DISPLAY_NAME_TO_CODES = Object.entries(SOURCE_CODE_DISPLAY_NAMES).reduce<Record<string, string[]>>((acc, [code, displayName]) => {
    const currentCodes = acc[displayName] ?? []
    acc[displayName] = [...currentCodes, code]
    return acc
}, {})

const escapeRegex = (value: string): string =>
    value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/**
 * Extracts the book name from a raw source string.
 * Handles variations such as "pág.", "pag.", "pg.", and "p.".
 */
export const extractBookName = (source: string): string =>
    source.replace(PAGE_SUFFIX_REGEX, "").trim()

export const extractSourcePage = (source: string): number | undefined => {
    const match = source.match(PAGE_NUMBER_REGEX)
    if (!match) {
        return undefined
    }

    const page = Number.parseInt(match[1], 10)
    return Number.isNaN(page) ? undefined : page
}

/**
 * Maps source identifiers and known aliases to their canonical display names.
 */
export const BOOK_DISPLAY_NAMES: Record<string, string> = {
    ...SOURCE_CODE_DISPLAY_NAMES,
    ...Object.fromEntries(SOURCE_TEXT_ALIASES.map(({ alias, displayName }) => [alias, displayName])),
}

/**
 * Returns the canonical display label for a source value.
 * Falls back to the extracted source name when no mapping exists.
 */
export const getBookDisplayName = (value: string): string => {
    const baseValue = extractBookName(value)
    const uppercaseValue = baseValue.toUpperCase()

    if (SOURCE_CODE_DISPLAY_NAMES[uppercaseValue]) {
        return SOURCE_CODE_DISPLAY_NAMES[uppercaseValue]
    }

    return TEXT_ALIAS_TO_DISPLAY_NAME[normalizeSourceToken(baseValue)] ?? baseValue
}

export const formatSourceDisplay = (source: string, page?: number): string => {
    const displayName = getBookDisplayName(source)
    return page ? `${displayName} pág. ${page}` : displayName
}

export const getSourceDisplayLabel = (value: string): string => {
    const page = extractSourcePage(value)
    return formatSourceDisplay(value, page)
}

export const getSourceSearchTerms = (value: string): string[] => {
    const baseValue = extractBookName(value)
    const displayName = getBookDisplayName(baseValue)
    const aliases = DISPLAY_NAME_TO_ALIASES[displayName] ?? []
    const codes = DISPLAY_NAME_TO_CODES[displayName] ?? []

    return Array.from(new Set([displayName, baseValue, ...aliases, ...codes]))
}

export const normalizeSourceSelection = (values: string[]): string[] =>
    Array.from(
        new Set(
            values
                .map((value) => value.trim())
                .filter((value) => value.length > 0)
                .map((value) => getBookDisplayName(value)),
        ),
    )

export const buildSourcePrefixRegexes = (values: string[]): RegExp[] => {
    const uniqueTerms = Array.from(
        new Set(
            values.flatMap((value) =>
                getSourceSearchTerms(value)
                    .map((term) => extractBookName(term))
                    .filter((term) => term.length > 0),
            ),
        ),
    )

    return uniqueTerms.map((term) => new RegExp(`^${escapeRegex(term)}`, "i"))
}

export const matchesSourceFilter = (source: string | undefined, filters?: string[]): boolean => {
    if (!filters || filters.length === 0) {
        return true
    }

    if (!source) {
        return false
    }

    const sourceDisplayName = getBookDisplayName(source)
    return filters.some((filter) => getBookDisplayName(filter) === sourceDisplayName)
}
