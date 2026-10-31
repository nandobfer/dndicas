import type { MaddoxMaster } from "./game-master"

/**
 * Mestre simulado (Maddox 3): textos fixos em pt-BR, sem IA, para exercitar o motor de turnos e o tempo
 * real. A narração com IA chega no Maddox 4.
 */

export const MADDOX_MOCK_NOTICE = "> *Narração simulada: a narração do Maddox com IA chega na próxima entrega.*"
export const MADDOX_MOCK_ANSWER_NOTICE = "> *Resposta simulada: a resposta do Maddox com IA chega na próxima entrega.*"

const QUESTION_PREVIEW_MAX = 200
const DECLARATION_PREVIEW_MAX = 280

const clip = (text: string, max: number) => {
    const flat = text.replace(/\s+/g, " ").trim()
    return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat
}

export const mockMaddoxMaster: MaddoxMaster = {
    async narrate({ campaignName, turnNumber, openingSituation, declarations }) {
        if (turnNumber <= 1 || declarations.length === 0) {
            const situation = openingSituation.trim() || `A história de **${campaignName}** começa. O mundo aguarda os primeiros passos dos heróis.`
            return [`### Turno ${turnNumber}`, "", situation, "", MADDOX_MOCK_NOTICE, "", "**O que vocês fazem?**"].join("\n")
        }
        const lines = declarations.map((item) =>
            item.kind === "pass"
                ? `- **${item.characterName}** preferiu esperar${item.skipped ? " (o dono pulou a vez)" : ""}.`
                : `- **${item.characterName}** — “${clip(item.content, DECLARATION_PREVIEW_MAX)}”`,
        )
        return [
            `### Turno ${turnNumber}`,
            "",
            "O Maddox ouve a mesa:",
            "",
            ...lines,
            "",
            "O mundo reage às escolhas de vocês: as consequências se desenham, e uma nova situação se abre à frente do grupo.",
            "",
            MADDOX_MOCK_NOTICE,
            "",
            "**O que vocês fazem?**",
        ].join("\n")
    },
    async answer({ characterName, question }) {
        return [`Sobre a pergunta de **${characterName}** — “${clip(question, QUESTION_PREVIEW_MAX)}”:`, "", "O Maddox considera a questão e responde sem encerrar o turno. Continuem declarando o que fazem.", "", MADDOX_MOCK_ANSWER_NOTICE].join("\n")
    },
}
