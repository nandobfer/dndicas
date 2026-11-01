import { catalogEntityTypes } from "@/features/mcp/server/catalog-schemas"
import { mentionsToMarkup } from "./catalog-mentions"
import {
    MADDOX_ABILITY_BONUS_MAX,
    MADDOX_ABILITY_BONUS_POINTS,
    MADDOX_CATALOG_ORIGIN_RIGORS,
    MADDOX_CATALOG_TOOL_NAMES,
    MADDOX_INTERVIEW_TOOL_NAMES,
    MADDOX_PROFILE_SECTIONS,
    MADDOX_PROPOSAL_MARKER,
    MADDOX_RIGOR_LEVEL_DEFS,
    MADDOX_SETTING_SECTIONS,
    MADDOX_SHEET_RIGORS,
    type MaddoxRigorLevel,
    type MaddoxScriptKind,
    type MaddoxScriptTopic,
} from "../constants"

/**
 * Instruções das entrevistas do Maddox — módulo PURO (sem banco nem IA), testado à parte. O roteiro
 * gravado na entrevista define as perguntas (tópicos ativos) e a ordem; o guia orienta a conversa.
 */

export interface InterviewPromptContext {
    kind: MaddoxScriptKind
    interviewerInstructions: string
    script: { version: number; guide: string; topics: readonly MaddoxScriptTopic[] }
    campaign: { name: string; rigor: MaddoxRigorLevel; setting: string; openingSituation: string }
    /** Entrevista de personagem: nome do esboço e dos outros personagens da mesa. */
    character?: { name: string } | null
    otherCharacters?: string[]
    /**
     * Atributos pelo card (Maddox 5, entrevista de personagem nos graus com ficha): situação atual e como as
     * ferramentas chegam (AI SDK ou MCP do Maddox com o token da entrevista).
     */
    abilities?: { status: string; tools: { kind: "ai-sdk" } | { kind: "mcp"; server: string; token: string } } | null
}

export function activeTopics(topics: readonly MaddoxScriptTopic[]): MaddoxScriptTopic[] {
    return topics.filter((topic) => topic.active && topic.text.trim())
}

export function rigorBlock(rigor: MaddoxRigorLevel): string {
    const def = MADDOX_RIGOR_LEVEL_DEFS[rigor]
    const rules = def.rules.length ? def.rules.map((item) => `  - ${item}`).join("\n") : "  - (nenhuma: jogo puramente narrativo, sem dados nem números)"
    const free = def.free.map((item) => `  - ${item}`).join("\n")
    return [`Grau de rigor da campanha: ${def.label} — ${def.description}`, "- Pelas regras do D&D:", rules, "- Livre, na narrativa:", free].join("\n")
}

export function buildInterviewInstructions(context: InterviewPromptContext): string {
    const topics = activeTopics(context.script.topics)
    const isScenario = context.kind === "scenario"
    const parts: string[] = [context.interviewerInstructions.trim()]

    parts.push(
        isScenario
            ? `## Entrevista atual\nEntrevista de CENÁRIO da campanha "${context.campaign.name}", com quem a criou.`
            : `## Entrevista atual\nEntrevista de PERSONAGEM da campanha "${context.campaign.name}". Personagem do jogador: "${context.character?.name ?? "a definir"}".`,
    )
    parts.push(rigorBlock(context.campaign.rigor))
    if (!isScenario && MADDOX_SHEET_RIGORS.includes(context.campaign.rigor)) {
        parts.push("Neste grau de rigor o personagem terá ficha do D&D: combine também raça, classe, origem (antecedente) e os seis atributos (pelo card, veja abaixo).")
        parts.push(catalogSection(context.campaign.rigor))
        parts.push(abilitiesSection(context.abilities ?? null))
    }

    if (!isScenario) {
        parts.push(`## Cenário da campanha (já definido)\n${context.campaign.setting.trim() || "(sem cenário registrado)"}`)
        if (context.campaign.openingSituation.trim()) parts.push(`## Situação inicial\n${context.campaign.openingSituation.trim()}`)
        if (context.otherCharacters?.length) parts.push(`## Outros personagens da mesa\n${context.otherCharacters.map((name) => `- ${name}`).join("\n")}`)
    }

    parts.push(`## Roteiro (versão ${context.script.version})\n${context.script.guide.trim()}`)
    parts.push(
        topics.length
            ? `## Tópicos, NESTA ORDEM\nConduza a conversa seguindo esta ordem, aproveitando o que já foi dito e perguntando só o que falta:\n${topics.map((topic, index) => `${index + 1}. ${topic.text.trim()}`).join("\n")}`
            : "## Tópicos\nO roteiro não tem tópicos ativos: siga só o guia.",
    )
    parts.push(MADDOX_RESPONSE_FORMAT)
    parts.push(
        [
            "## Conclusão",
            "- Quando houver base suficiente pelos critérios do roteiro, apresente uma síntese breve do que foi combinado e pergunte se a pessoa confirma ou quer ajustes.",
            `- Somente na mensagem com essa síntese, termine com uma linha contendo exatamente ${MADDOX_PROPOSAL_MARKER} (ela é invisível para a pessoa e mostra o botão de confirmar).`,
            "- Se a pessoa pedir ajustes depois da síntese, incorpore-os e apresente a síntese atualizada com a mesma linha.",
            "- Nunca use essa linha em outras mensagens. Não comece a narrar a história: a preparação termina na confirmação.",
        ].join("\n"),
    )
    return parts.join("\n\n")
}

const T = MADDOX_INTERVIEW_TOOL_NAMES
const C = MADDOX_CATALOG_TOOL_NAMES

/** Seção "Catálogo do DnDicas" (entrevista de personagem nos graus com ficha): consultar antes de sugerir. */
export function catalogSection(rigor: MaddoxRigorLevel): string {
    const strict = MADDOX_CATALOG_ORIGIN_RIGORS.includes(rigor)
    return [
        "## Catálogo do DnDicas",
        `- Antes de sugerir ou confirmar raça, classe, subclasse, origem (antecedente), talento ou magia, consulte \`${C.search}\` (para listar todas as opções de um tipo, envie só \`tipos\`, por exemplo { "tipos": ["Origem"] }) e, para os detalhes (atributos sugeridos, perícias, traços), \`${C.get}\`.`,
        "- Só cite como do catálogo o que a busca devolveu, com o nome exato dela na marcação {{Tipo:Nome}}. Nunca use nomes de memória ou de outras edições do D&D.",
        strict
            ? "- Neste grau, a raça, a classe, a subclasse e a origem do personagem precisam ser do catálogo. Se o jogador pedir algo que não existe nele, diga isso e mostre as opções mais próximas da busca."
            : "- Neste grau, prefira o catálogo. Algo próprio (fora do catálogo) só se o jogador quiser, e diga com clareza que é próprio.",
    ].join("\n")
}

/** Seção "Atributos do personagem" (graus com ficha). */
export function abilitiesSection(abilities: InterviewPromptContext["abilities"]): string {
    const lines = [
        "## Atributos do personagem",
        `- Os seis atributos são definidos SÓ pelo card de atributos: chame \`${T.request}\` quando chegar a hora (o card aparece abaixo da sua fala). Nunca peça ao jogador que digite números, nunca role dados nem invente valores por ele.`,
        "- Métodos do card: conjunto padrão (15, 14, 13, 12, 10 e 8, um por atributo); compra de pontos (27 pontos, cada atributo entre 8 e 15); rolagem, feita pelo próprio jogador no card: cinco rolagens de 4d6 descartando o menor dado, e a sexta pontuação é 72 menos a soma das cinco. Explique em poucas linhas e deixe o jogador escolher.",
        "- Quando o jogador enviar, você recebe uma fala do sistema com os valores: comente em poucas linhas e siga a entrevista. Para mudar os valores, reabra o card com a mesma ferramenta (ele vem preenchido com os atuais).",
        `- Bônus do antecedente (sugira, não é obrigatório): com a origem definida e os atributos enviados, proponha distribuir ${MADDOX_ABILITY_BONUS_POINTS} pontos (no máximo +${MADDOX_ABILITY_BONUS_MAX} por atributo, nos atributos sugeridos pelo antecedente) e aplique com \`${T.bonus}\`. Antes de propor os pontos, confira a origem com \`${C.search}\` e os atributos sugeridos com \`${C.get}\`.`,
        `- Antes da síntese, consulte \`${T.get}\` e liste na síntese os valores finais (base + bônus).`,
    ]
    if (abilities) {
        lines.push(`\n### Atributos: situação atual\n${abilities.status}`)
        if (abilities.tools.kind === "mcp") {
            lines.push(
                `\n### Ferramentas de atributos (MCP)\nUse as ferramentas \`${T.request}\`, \`${T.get}\`, \`${T.bonus}\`, \`${C.search}\` e \`${C.get}\` do servidor MCP \`${abilities.tools.server}\`. Em TODA chamada envie \`turno\` com este valor exato: ${abilities.tools.token}`,
            )
        }
    }
    return lines.join("\n")
}

/** Como citar uma entidade do catálogo (marcação explícita com tipo, resolvida em menção pelo servidor). */
export const CATALOG_CITATION_RULE = [
    `- Para citar uma entidade do catálogo de D&D, escreva {{Tipo:Nome oficial em português}} — por exemplo {{Raça:Elfo}}, {{Classe:Mago}}, {{Magia:Bola de Fogo}}. Tipos aceitos: ${catalogEntityTypes.join(", ")}. Ela vira uma menção clicável do catálogo.`,
    "- Nunca use essa marcação para personagens, jogadores, lugares, facções, NPCs ou qualquer coisa criada na campanha: esses nomes vão em **negrito**. Na dúvida se algo existe no D&D, use negrito.",
    "- **Negrito** nunca vira menção: serve só para ênfase e para nomes próprios do mundo da campanha. Não use links nem HTML.",
].join("\n")

/**
 * Formato fixo das falas do entrevistador (não depende do texto configurado na aba): Markdown que a tela pinta
 * como o Agente Opex e citações explícitas do catálogo, que o servidor transforma em menções clicáveis.
 */
export const MADDOX_RESPONSE_FORMAT = [
    "## Formato da resposta",
    "- Responda em Markdown, em blocos curtos e fáceis de ler; termine com no máximo duas perguntas por vez.",
    "- Use **negrito** para nomes próprios do mundo (personagens, lugares, facções) e para ênfase.",
    CATALOG_CITATION_RULE,
    "- Use `###` para separar blocos quando houver mais de um assunto e listas para opções e sugestões.",
    "- Use citação (`>`) para trechos de ambientação ou falas dentro do mundo do jogo.",
    "- Evite tabelas longas. Na síntese final, use um título (`###`) por tópico combinado.",
].join("\n")

/** Pedido de abertura (primeira mensagem do Maddox, antes de qualquer resposta). */
export function openingPrompt(kind: MaddoxScriptKind): string {
    return kind === "scenario"
        ? "Comece a entrevista de cenário: apresente-se brevemente como Maddox e faça as primeiras perguntas."
        : "Comece a entrevista de personagem: apresente-se brevemente como Maddox, lembre em uma frase o cenário da campanha e faça as primeiras perguntas."
}

/** Dica acrescentada ao turno quando o JEV indica que já há base suficiente. */
export const JEV_PROPOSAL_HINT = "Já há base suficiente para concluir: apresente agora a síntese e peça a confirmação."

/** Separa o marcador de proposta do texto da mensagem. */
export function extractProposal(text: string): { content: string; proposal: boolean } {
    if (!text.includes(MADDOX_PROPOSAL_MARKER)) return { content: text.trim(), proposal: false }
    return { content: text.split(MADDOX_PROPOSAL_MARKER).join("").trim(), proposal: true }
}

/**
 * Filtro do stream: segura o fim do texto que ainda pode ser o começo do marcador, para que ele nunca
 * chegue à tela mesmo partido entre deltas. `push` devolve o que já pode ser mostrado; `flush`, o resto.
 */
export function createMarkerFilter() {
    let pending = ""
    const strip = (value: string) => value.split(MADDOX_PROPOSAL_MARKER).join("")
    return {
        push(delta: string): string {
            pending = strip(pending + delta)
            let keep = 0
            for (let size = Math.min(MADDOX_PROPOSAL_MARKER.length - 1, pending.length); size > 0; size--) {
                if (MADDOX_PROPOSAL_MARKER.startsWith(pending.slice(-size))) {
                    keep = size
                    break
                }
            }
            const out = pending.slice(0, pending.length - keep)
            pending = pending.slice(pending.length - keep)
            return out
        },
        flush(): string {
            const out = strip(pending)
            pending = ""
            return out
        },
    }
}

export interface TranscriptMessage {
    role: "maddox" | "user"
    content: string
    internal?: boolean
}

export function transcriptText(messages: readonly TranscriptMessage[]): string {
    return messages.map((message) => `${message.internal ? "SISTEMA" : message.role === "maddox" ? "MADDOX" : "JOGADOR"}: ${mentionsToMarkup(message.content)}`).join("\n\n")
}

/** Instruções da consolidação (JSON estrito) do cenário ou do personagem. */
export function buildConsolidationInstructions(context: InterviewPromptContext, withSheet: boolean, abilitiesDefined = false): string {
    const base = [
        "Você consolida uma entrevista de preparação de campanha de RPG em JSON. Responda SOMENTE com um objeto JSON válido, sem texto antes ou depois e sem bloco de código.",
        "Use apenas o que foi combinado e confirmado na conversa; não invente fatos. O que não foi definido fica como \"a definir durante a história\". Escreva em português do Brasil, em Markdown dentro das strings. Cite entidades do catálogo de D&D (raças, classes, subclasses, origens, magias, talentos, itens, monstros) como {{Tipo:Nome oficial}}, como na conversa; personagens, lugares e tudo o que foi criado na campanha vão em **negrito**, nunca nessa marcação.",
        rigorBlock(context.campaign.rigor),
    ]
    if (context.kind === "scenario") {
        const keys = MADDOX_SETTING_SECTIONS.map((item) => `    "${item.key}": "<${item.label}>"`).join(",\n")
        base.push(
            `Formato:\n{\n  "setting": {\n${keys}\n  },\n  "openingSituation": "<onde e quando a história começa, a condição inicial e o que coloca a narrativa em movimento>",\n  "campaignName": "<nome da campanha combinado na conversa, ou null se nenhum foi combinado>"\n}`,
        )
    } else {
        const keys = MADDOX_PROFILE_SECTIONS.map((item) => `    "${item.key}": "<${item.label}>"`).join(",\n")
        const sheet = withSheet
            ? `,\n  "sheet": {\n    "race": "<raça>", "class": "<classe>", "subclass": "<subclasse ou null>", "origin": "<origem/antecedente>",\n    "appearance": "<aparência>", "age": "<idade>", "height": "<altura>", "weight": "<peso>", "eyes": "<olhos>", "skin": "<pele>", "hair": "<cabelo>",\n    "attributes": { "strength": <1-30 ou null>, "dexterity": <...>, "constitution": <...>, "intelligence": <...>, "wisdom": <...>, "charisma": <...> }\n  }`
            : ',\n  "sheet": null'
        if (withSheet && abilitiesDefined) base.push("Os atributos já foram definidos pelo card de atributos e entram na ficha direto: em \"attributes\" devolva null.")
        base.push(`Cenário da campanha:\n${context.campaign.setting.trim() || "(sem cenário)"}`)
        base.push(`Formato:\n{\n  "name": "<nome do personagem combinado, ou null>",\n  "profile": {\n${keys}\n  }${sheet}\n}`)
    }
    return base.join("\n\n")
}

/** Extrai o primeiro objeto JSON da resposta (tolera cercas de código e texto ao redor). */
export function parseJsonObject(text: string): unknown {
    const cleaned = text.replace(/```(?:json)?/gi, "").trim()
    const start = cleaned.indexOf("{")
    const end = cleaned.lastIndexOf("}")
    if (start < 0 || end <= start) throw new Error("A resposta não contém um objeto JSON")
    return JSON.parse(cleaned.slice(start, end + 1))
}

/** Markdown do cenário consolidado, nas seções do `setting.md`. */
export function settingMarkdown(setting: Record<string, string>): string {
    return MADDOX_SETTING_SECTIONS.map((item) => `## ${item.label}\n${setting[item.key]?.trim() || "a definir durante a história"}`).join("\n\n")
}
