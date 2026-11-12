import { describe, expect, it } from "vitest"
import { dropRewrittenParagraphs, sameParagraph, splitOpenParagraph } from "@/features/maddox/narration-dedupe"
import { LEGIT_NARRATIONS, REWRITTEN_NARRATIONS } from "./fixtures/narration-rewrites"

const paragraphs = (text: string) => text.split(/\n[ \t]*\n/).map((part) => part.trim()).filter(Boolean)
const noRepeats = (text: string) => {
    const list = paragraphs(text)
    for (let later = 1; later < list.length; later += 1) for (let earlier = 0; earlier < later; earlier += 1) if (sameParagraph(list[earlier], list[later])) return false
    return true
}

describe("narração reescrita (DND-52)", () => {
    it("nos textos reais gravados com duplicação, fica só a reescrita, sem parágrafo repetido", () => {
        for (const [name, text] of Object.entries(REWRITTEN_NARRATIONS)) {
            const result = dropRewrittenParagraphs(text)
            expect(result.dropped, name).toBeGreaterThan(0)
            expect(noRepeats(result.text), name).toBe(true)
            const original = paragraphs(text)
            // A reescrita é a parte final do texto original.
            expect(original.slice(original.length - paragraphs(result.text).length), name).toEqual(paragraphs(result.text))
        }
    })

    it("turno 4: mantém a segunda versão inteira, a que cobre o recuo da Vaelyra", () => {
        const result = dropRewrittenParagraphs(REWRITTEN_NARRATIONS.turn4DartOfIce)
        const kept = paragraphs(result.text)
        expect(result.dropped).toBe(2)
        expect(kept).toHaveLength(2)
        expect(kept[0]).toContain("Ele recua meio passo")
        expect(kept[1]).toMatch(/^\*\*Vaelyra\*\* recua mais dois passos/)
        expect(result.text.match(/O dardo de gelo atravessa/g)).toHaveLength(1)
    })

    it("o mesmo bloco entregue duas vezes sai uma vez", () => {
        const block = "A porta range e se abre para um corredor úmido, iluminado por tochas que tremem.\n\nAo fundo, alguém tosse e arrasta uma corrente pelo chão de pedra. O que vocês fazem?"
        const result = dropRewrittenParagraphs(`${block}\n\n${block}`)
        expect(result).toEqual({ text: block, dropped: 2 })
    })

    it("narrações legítimas, de vários parágrafos, voltam intactas", () => {
        expect(LEGIT_NARRATIONS.length).toBeGreaterThan(5)
        for (const text of LEGIT_NARRATIONS) expect(dropRewrittenParagraphs(text)).toEqual({ text, dropped: 0 })
    })

    it("continuação que acrescenta cena nova (texto, ferramenta, texto) não muda", () => {
        const text = [
            "O goblin avança pela lama e ergue a cimitarra contra o escudo de **Uther**, os dentes à mostra.",
            "A lâmina bate no aço com um estalo seco e escorrega; o anão firma os pés e devolve o empurrão.",
            "Atrás da carroça, **Vaelyra** prepara outro dardo de gelo. O que vocês fazem?",
        ].join("\n\n")
        expect(dropRewrittenParagraphs(text)).toEqual({ text, dropped: 0 })
    })

    it("frase curta repetida só conta quando é igual; parecida, fica", () => {
        expect(dropRewrittenParagraphs("A chuva cai sobre a estrada vazia e fria da colina.\n\nO que você faz?\n\nUther sobe na carroça.\n\nO que vocês fazem?").dropped).toBe(0)
        expect(dropRewrittenParagraphs("Uma linha só, sem quebra.")).toEqual({ text: "Uma linha só, sem quebra.", dropped: 0 })
    })

    it("fala ou pausa curta repetida de propósito, com cena nova no meio, fica intacta (nem igual conta)", () => {
        for (const short of ["— Corram!", "Silêncio.", "O que vocês fazem?"]) {
            const text = [
                short,
                "O goblin da direita larga o arco e dispara pela trilha, tropeçando nas raízes, os olhos arregalados de medo.",
                "Do mato, um segundo vulto surge com uma tocha e grita para os outros, a voz rachada de pânico.",
                short,
            ].join("\n\n")
            expect(dropRewrittenParagraphs(text), short).toEqual({ text, dropped: 0 })
            expect(sameParagraph(short, short), short).toBe(false)
        }
    })

    it("separa os parágrafos fechados do trecho ainda em escrita", () => {
        expect(splitOpenParagraph("Silêncio.\n\nO vento volta.\n\nSilêncio")).toEqual({ closed: "Silêncio.\n\nO vento volta.\n\n", open: "Silêncio" })
        expect(splitOpenParagraph("Sem quebra ainda")).toEqual({ closed: "", open: "Sem quebra ainda" })
        expect(splitOpenParagraph("Um parágrafo.\n\n")).toEqual({ closed: "Um parágrafo.\n\n", open: "" })
    })

    it("compara sem a marcação do catálogo nem das menções, e preserva a marcação no que fica", () => {
        const first = "{{Magia:Raio de Gelo}} atravessa a fumaça e crava no ombro do goblin, que grita e recua um passo na lama."
        const second = "[Raio de Gelo](#mention:Magia:abc) atravessa a fumaça e crava no ombro do goblin, que grita e recua meio passo na lama."
        const result = dropRewrittenParagraphs(`${first}\n\n${second}`)
        expect(result).toEqual({ text: second, dropped: 1 })
    })

    it("mantém a quebra de parágrafo no fim (o texto ao vivo continua no parágrafo seguinte)", () => {
        const paragraph = "O martelo desce com o peso inteiro do anão e o goblin se atira para trás como um bicho."
        expect(dropRewrittenParagraphs(`${paragraph}\n\n${paragraph}\n\n`).text).toBe(`${paragraph}\n\n`)
    })
})
