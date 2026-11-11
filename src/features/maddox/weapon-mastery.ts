/**
 * Maestrias de arma (DND-49) — módulo PURO. As regras vêm das entidades "Maestria: …" do catálogo (Regras); aqui só o
 * reconhecimento do nome, os rótulos e o limite de maestrias da classe.
 */

export const MADDOX_MASTERY_KEYS = ["nick", "vex", "sap", "topple", "graze", "push", "slow", "cleave"] as const
export type MaddoxMasteryKey = (typeof MADDOX_MASTERY_KEYS)[number]

export const MADDOX_MASTERY_LABELS: Record<MaddoxMasteryKey, string> = {
    nick: "Ágil",
    vex: "Afligir",
    sap: "Drenar",
    topple: "Derrubar",
    graze: "Garantido",
    push: "Empurrar",
    slow: "Lentidão",
    cleave: "Trespassar",
}

const fold = (value: string) =>
    value
        .replace(/<[^>]*>/g, " ")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()

const NAMES: Record<MaddoxMasteryKey, RegExp> = {
    nick: /\b(agil|nick)\b/,
    vex: /\b(afligir|vex)\b/,
    sap: /\b(drenar|sap)\b/,
    topple: /\b(derrubar|topple)\b/,
    graze: /\b(garantido|graze)\b/,
    push: /\b(empurrar|push)\b/,
    slow: /\b(lentidao|slow)\b/,
    cleave: /\b(trespassar|cleave)\b/,
}

/** "Maestria: Ágil / Nick" (ou a menção do item) → `nick`; `null` quando o texto não nomeia uma maestria conhecida. */
export function masteryKeyFromName(value: string | null | undefined): MaddoxMasteryKey | null {
    const text = fold(String(value ?? "")).replace(/data-[a-z-]+="[^"]*"/g, " ")
    for (const key of MADDOX_MASTERY_KEYS) if (NAMES[key].test(text)) return key
    return null
}

/** Rótulo para a tela: "Maestria Ágil". */
export const masteryLabel = (key: MaddoxMasteryKey) => `Maestria ${MADDOX_MASTERY_LABELS[key]}`

const NUMBER_WORDS: Record<string, number> = { um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 }

/** Nome de característica de classe que dá maestria ("Maestria em Arma (Ladino)", "Maestria com Armas (Paladino)"). */
export const isWeaponMasteryFeature = (name: string) => /\bmaestria (em|com) armas?\b|\bweapon mastery\b/.test(fold(name))

interface ProgressionTable {
    customColumns?: { label?: string | null; values?: (string | number | null)[] | null }[] | null
}

/**
 * Limite de maestrias da classe no nível (decisão do dono, DND-49): a coluna da tabela de progressão da classe, quando
 * existir; senão, o número escrito no trecho da característica ("dois tipos de armas", "3 tipos"). Sem número, `null`
 * (a alteração é recusada: "limite de maestrias não encontrado no catálogo").
 */
export function masteryLimit(table: ProgressionTable | null | undefined, level: number, featureText: string | null | undefined): number | null {
    const column = (table?.customColumns ?? []).find((item) => /maestria|mastery/.test(fold(String(item?.label ?? ""))))
    if (column?.values?.length) {
        const raw = column.values[Math.max(0, Math.min(column.values.length - 1, level - 1))]
        const value = Number.parseInt(String(raw ?? ""), 10)
        if (Number.isFinite(value) && value > 0) return value
    }
    const text = fold(String(featureText ?? ""))
    const match = /\b(\d+|um|uma|dois|duas|tres|quatro|cinco|seis|one|two|three|four|five|six)\s+(tipos?|armas?|kinds?|types?)\b/.exec(text)
    if (!match) return null
    const word = match[1]!
    const value = /^\d+$/.test(word) ? Number(word) : NUMBER_WORDS[word]
    return value && value > 0 ? value : null
}
