import { memoriesSection } from "@/features/ai/memories-prompt"
import { MADDOX_DECLARATION_VALIDATION_RIGORS, MADDOX_PROFILE_SECTIONS, type MaddoxCampaignMemoryKind, type MaddoxGameMessageKind, type MaddoxQuestStatus, type MaddoxRigorLevel, type MaddoxVisibility } from "../constants"
import { CATALOG_CITATION_RULE, rigorBlock } from "./interview-prompt"

/**
 * Instruções do Maddox narrador (Maddox 4) — módulo PURO (sem banco nem IA), testado à parte. As regras de narração
 * são adaptadas do `~/code/roleplay/agente-exemplo.md` para uma mesa com vários jogadores; o estado gravado pelas
 * ferramentas (checkpoint, NPCs, locais, missões, memórias, condição dos personagens) entra a cada geração.
 */

/** Regras fixas do narrador (no código, independentes do texto da aba). */
export const MADDOX_NARRATOR_RULES = [
    "## Como narrar",
    "### Quem decide o quê",
    "- Cada jogador decide as ações voluntárias, falas, respostas, objetivos e escolhas do próprio personagem. Nunca invente uma fala de um personagem jogador, aceite uma proposta em nome dele, escolha um caminho, inicie um ataque ou decida uma fuga por ele.",
    "- Você administra o mundo, os NPCs, os resultados das tentativas e o que é involuntário: sentimentos, sensações, impulsos, reflexos e respostas físicas. Sentir não é decidir: medo não faz fugir, raiva não faz atacar.",
    "- Trate cada declaração como intenção ou tentativa, nunca como resultado garantido. Desenvolva uma ação já autorizada até as consequências naturais e pare diante da próxima decisão relevante.",
    "- Uma intenção ampla (\"quero escapar\") não autoriza todas as decisões para alcançá-la. Intenção ambígua com consequência relevante: peça esclarecimento antes de resolver.",
    "",
    "### Estilo",
    "- Escreva como uma cena de livro: prosa descritiva, concreta e sensorial (luz, sons, cheiros, temperatura, texturas), com ritmo adequado — tensão pede clareza; descanso permite contemplação.",
    "- Narre em segunda pessoa, dirigindo-se aos personagens pelo nome quando houver mais de um. Situe o grupo no espaço e descreva o que importa para agir.",
    "- Dê aos NPCs vozes, intenções e gestos próprios. Revele tensões por acontecimentos, diálogos e detalhes observáveis.",
    "- Restrinja a narração ao que os personagens podem perceber, lembrar ou saber. Preserve os mistérios: nunca revele notas exclusivas do mestre, intenções secretas ou acontecimentos distantes.",
    "- Evite linguagem de sistema, comentários de bastidores e números mecânicos. Nunca anuncie que consultou ou gravou anotações.",
    "",
    "### Fazer a história andar",
    "- Cada narração desenvolve a situação: uma consequência, reação, informação, mudança de relação, oportunidade ou resolução. Não reescreva a mesma cena com outros adjetivos nem recapitule o que já se sabe.",
    "- NPCs e o mundo agem por conta própria. Encerre cenas que já cumpriram seu propósito e faça transições causais; sintetize deslocamentos e rotinas já autorizados.",
    "- Resolva as declarações de todos os personagens no mesmo turno, entrelaçadas quando acontecem juntas. Quem \"não fez nada\" continua presente na cena, sem agir por vontade própria.",
    "- Termine sempre num ponto de participação, com uma situação concreta e uma pergunta que permita escolha real (\"O que vocês fazem?\" ou equivalente). Ofereça possibilidades na cena, nunca uma lista fechada de ações.",
    "",
    "### Resolução das ações",
    "- Decida os resultados pela coerência da ficção: capacidades e limitações estabelecidas, treinamento, condição física e emocional, equipamentos, tempo, distância, terreno, visibilidade e as reações dos demais.",
    "- Uma tentativa pode dar em sucesso, sucesso parcial, sucesso com custo, falha ou consequência inesperada; a razão existe na ficção. Não garanta vitórias por conveniência nem invente obstáculos arbitrários. Acolha soluções criativas que façam sentido.",
    "- Ferimentos e desgaste continuam influenciando as cenas seguintes até uma recuperação coerente.",
].join("\n")

/** Modo narrativo puro desta entrega: nenhum grau de rigor usa rolagens ou números. */
export const MADDOX_NARRATIVE_MODE_RULE = [
    "## Modo narrativo",
    "- Toda a experiência é narrativa, inclusive combate, aprendizado e progressão. Não use dados, rolagens, testes numéricos, atributos com pontuação, pontos de vida, barras de recursos nem turnos mecânicos.",
    "- Descreva capacidades, ferimentos, desgaste e recursos qualitativamente. Quantidades concretas do mundo (três flechas, dois dias de viagem) podem aparecer normalmente.",
].join("\n")

/** Graus que julgam a validade da ação livre na narração (os demais validam ao declarar). */
export function judgesFreeActionsInNarration(rigor: MaddoxRigorLevel): boolean {
    return !MADDOX_DECLARATION_VALIDATION_RIGORS.includes(rigor)
}

export const MADDOX_FREE_ACTION_RULE = [
    "## Ações impossíveis",
    "- Avalie se cada ação declarada é possível para o personagem e coerente com o cenário e o grau de rigor. Se não for (um poder que ele não tem, algo que as regras do mundo não permitem), não recuse fora da história: narre a tentativa frustrada, com a causa perceptível na ficção e pistas sobre o impedimento, sem impor custo só porque falhou.",
].join("\n")

export const MADDOX_NARRATOR_FORMAT = [
    "## Formato da resposta",
    "- Markdown em parágrafos curtos de prosa. Use **negrito** para nomes próprios do mundo (personagens, lugares, facções, NPCs) e para ênfase, e citação (`>`) para falas e trechos marcantes quando ajudar.",
    CATALOG_CITATION_RULE,
    "- Não use títulos de turno, tabelas nem listas de regras; a narração é uma cena.",
].join("\n")

export const MADDOX_PERSISTENCE_RULE = [
    "## Continuidade e anotações da campanha",
    "- O estado gravado abaixo é a versão oficial da história. Consulte os detalhes pelas ferramentas quando a cena depender deles (NPC, local, missão, memória) em vez de inventar.",
    "- Antes de concluir, grave o que mudou: `update_campaign_state` quando a cena, o local, a situação ou a decisão aguardada mudar; `save_npc` para NPCs novos ou que mudaram; `save_memory` para locais (`local`), missões (`missao`, com `status`), marcos da história (`evento`), relações (`relacao`) e fatos duráveis (`fato`); `update_character_state` quando ferimentos, recursos ou a situação de um personagem mudar.",
    "- Grave só o que é novo ou mudou, sem duplicar nem gravar a cada golpe ou fala. Separe o que os jogadores sabem (`players`) do que é segredo do mestre (`master`).",
    "- Grave antes ou depois de escrever a narração, nunca no meio dela, e não comente as gravações no texto.",
].join("\n")

export interface NarratorCharacter {
    name: string
    playerName: string
    profile: Record<string, string>
    currentState: string
}

export interface NarratorNpc {
    name: string
    status: string
    visibility: MaddoxVisibility
    publicDescription: string
    masterNotes: string
}

export interface NarratorMemory {
    kind: MaddoxCampaignMemoryKind
    title: string
    text: string
    visibility: MaddoxVisibility
    status: MaddoxQuestStatus | null
}

export interface NarratorPromptContext {
    instructions: string
    agentMemories: readonly string[]
    rigor: MaddoxRigorLevel
    campaignName: string
    setting: string
    openingSituation: string
    state: { scene: string; location: string; situation: string; pendingDecision: string }
    characters: readonly NarratorCharacter[]
    npcs: readonly NarratorNpc[]
    memories: readonly NarratorMemory[]
}

const oneLine = (value: string, max: number) => {
    const flat = value.replace(/\s+/g, " ").trim()
    return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat
}

const MEMORY_LABELS: Record<MaddoxCampaignMemoryKind, string> = { fato: "Fatos", evento: "Marcos da história", local: "Locais", missao: "Missões", relacao: "Relações", outro: "Outras anotações" }

function characterBlock(character: NarratorCharacter): string {
    const sections = MADDOX_PROFILE_SECTIONS.map((section) => {
        const text = character.profile[section.key]?.trim()
        return text ? `- ${section.label}: ${oneLine(text, 1_200)}` : null
    }).filter(Boolean)
    return [`### ${character.name} (jogador: ${character.playerName})`, ...sections, `- Condição atual na história: ${character.currentState.trim() ? oneLine(character.currentState, 1_200) : "(sem mudanças registradas)"}`].join("\n")
}

function stateBlock(state: NarratorPromptContext["state"]): string {
    const lines = [
        ["Cena", state.scene],
        ["Local", state.location],
        ["Situação", state.situation],
        ["Decisão aguardada", state.pendingDecision],
    ]
        .filter(([, value]) => value?.trim())
        .map(([label, value]) => `- ${label}: ${value!.trim()}`)
    return ["## Estado atual da história", lines.length ? lines.join("\n") : "- (ainda não registrado: a história está começando)"].join("\n")
}

function npcsBlock(npcs: readonly NarratorNpc[]): string | null {
    if (!npcs.length) return null
    const lines = npcs.map((npc) => {
        const secret = npc.masterNotes.trim() ? ` — [SÓ O MESTRE] ${oneLine(npc.masterNotes, 240)}` : ""
        const hidden = npc.visibility === "master" ? " [desconhecido dos jogadores]" : ""
        return `- **${npc.name}** (${npc.status})${hidden}: ${oneLine(npc.publicDescription, 240) || "sem descrição"}${secret}`
    })
    return ["## NPCs", ...lines].join("\n")
}

function memoriesBlock(memories: readonly NarratorMemory[]): string | null {
    if (!memories.length) return null
    const groups = new Map<MaddoxCampaignMemoryKind, NarratorMemory[]>()
    for (const memory of memories) groups.set(memory.kind, [...(groups.get(memory.kind) ?? []), memory])
    const parts = ["## Anotações da campanha (resumo; detalhes por `search_memories`)"]
    for (const [kind, items] of groups) {
        parts.push(`### ${MEMORY_LABELS[kind]}`)
        for (const item of items) {
            const status = item.kind === "missao" && item.status ? ` [${item.status}]` : ""
            const secret = item.visibility === "master" ? " [SÓ O MESTRE]" : ""
            parts.push(`- **${item.title}**${status}${secret}: ${oneLine(item.text, 220)}`)
        }
    }
    return parts.join("\n")
}

export type NarratorToolMode = { kind: "ai-sdk" } | { kind: "mcp"; server: string; turnToken: string }

/** Bloco das ferramentas: na AI SDK elas vêm na chamada; no OpenCode, pelo MCP com o token de turno. */
function toolsBlock(mode: NarratorToolMode): string | null {
    if (mode.kind === "ai-sdk") return null
    return [
        "## Ferramentas desta narração",
        `- As ferramentas de anotações da campanha estão no servidor MCP \`${mode.server}\` (get_campaign_state, update_campaign_state, list_npcs, get_npc, save_npc, search_memories, save_memory, update_character_state).`,
        `- Em TODA chamada a essas ferramentas, envie o campo \`turno\` exatamente com este valor: \`${mode.turnToken}\`.`,
        "- Não use outras ferramentas (arquivos, terminal, web): a campanha vive só nessas anotações.",
    ].join("\n")
}

export function buildNarratorInstructions(context: NarratorPromptContext, mode: NarratorToolMode): string {
    const parts: string[] = [context.instructions.trim()]
    const memories = memoriesSection(context.agentMemories).trim()
    if (memories) parts.push(memories)
    parts.push(MADDOX_NARRATOR_RULES, MADDOX_NARRATIVE_MODE_RULE, rigorBlock(context.rigor))
    if (judgesFreeActionsInNarration(context.rigor)) parts.push(MADDOX_FREE_ACTION_RULE)
    parts.push(MADDOX_NARRATOR_FORMAT, MADDOX_PERSISTENCE_RULE)
    const tools = toolsBlock(mode)
    if (tools) parts.push(tools)
    parts.push(`# Campanha "${context.campaignName}"`)
    parts.push(`## Cenário\n${context.setting.trim() || "(sem cenário registrado)"}`)
    if (context.openingSituation.trim()) parts.push(`## Situação inicial combinada\n${context.openingSituation.trim()}`)
    parts.push(["## Personagens dos jogadores", ...(context.characters.length ? context.characters.map(characterBlock) : ["(nenhum)"])].join("\n\n"))
    parts.push(stateBlock(context.state))
    const npcs = npcsBlock(context.npcs)
    if (npcs) parts.push(npcs)
    const notes = memoriesBlock(context.memories)
    if (notes) parts.push(notes)
    return parts.join("\n\n")
}

// ── Tarefa da geração ──────────────────────────────────────────────────────────

export interface NarratorDeclaration {
    characterName: string
    kind: "declaration" | "pass"
    content: string
    skipped: boolean
}

export type NarratorTask =
    | { kind: "narration"; turnNumber: number; declarations: readonly NarratorDeclaration[] }
    | { kind: "answer"; turnNumber: number; characterName: string; question: string; declarations: readonly NarratorDeclaration[] }

const declarationLines = (declarations: readonly NarratorDeclaration[]) =>
    declarations.map((item) => (item.kind === "pass" ? `- **${item.characterName}**: não fez nada${item.skipped ? " (o dono pulou a vez do jogador)" : ""}.` : `- **${item.characterName}**: ${item.content.trim()}`))

export function narratorTaskText(task: NarratorTask): string {
    if (task.kind === "answer") {
        return [
            `# Pergunta ao mestre (turno ${task.turnNumber}, turno dos jogadores)`,
            `**${task.characterName}** pergunta: ${task.question.trim()}`,
            ...(task.declarations.length ? ["", "Declarações já feitas neste turno (ainda não resolvidas):", ...declarationLines(task.declarations)] : []),
            "",
            "Responda diretamente, em poucas frases, só com o que o personagem pode perceber, lembrar ou saber. NÃO avance a cena, não resolva declarações e não atribua ações a ninguém: o turno continua aberto. Se a resposta estabelecer um fato novo do mundo, grave-o.",
        ].join("\n")
    }
    if (task.declarations.length === 0) {
        return [
            `# Abertura da campanha (turno ${task.turnNumber})`,
            "Abra a história a partir da situação inicial combinada: situe os personagens dos jogadores na cena, apresente o que os coloca em movimento e termine perguntando o que eles fazem. Grave o estado inicial da história (cena, local, situação e decisão aguardada) e os NPCs e locais que aparecerem.",
        ].join("\n")
    }
    return [
        `# Turno ${task.turnNumber} do mestre`,
        "Declarações do turno dos jogadores que acabou de fechar:",
        ...declarationLines(task.declarations),
        "",
        "Narre o resultado dessas tentativas e as reações do mundo, desenvolva a situação e termine no próximo ponto de decisão. Depois grave o que mudou.",
    ].join("\n")
}

// ── Transcrição recente ────────────────────────────────────────────────────────

export interface NarratorTranscriptMessage {
    turnNumber: number
    kind: MaddoxGameMessageKind
    characterName: string | null
    content: string
}

/** Transcrição dos últimos acontecimentos, das mais recentes para trás, até `maxChars`, em ordem cronológica. */
export function narratorTranscript(messages: readonly NarratorTranscriptMessage[], maxChars: number): string {
    const lines: string[] = []
    let size = 0
    for (let index = messages.length - 1; index >= 0; index--) {
        const message = messages[index]!
        const content = message.content.trim()
        if (!content && message.kind !== "pass") continue
        const who = message.characterName ?? "Personagem"
        const line =
            message.kind === "narration"
                ? `[Turno ${message.turnNumber} — Maddox narra]\n${content}`
                : message.kind === "answer"
                  ? `[Turno ${message.turnNumber} — Maddox responde]\n${content}`
                  : message.kind === "question"
                    ? `[Turno ${message.turnNumber} — ${who} pergunta] ${content}`
                    : message.kind === "pass"
                      ? `[Turno ${message.turnNumber} — ${who} não fez nada]`
                      : `[Turno ${message.turnNumber} — ${who} declara] ${content}`
        if (size + line.length > maxChars && lines.length > 0) break
        lines.unshift(line)
        size += line.length + 2
    }
    return lines.join("\n\n")
}
