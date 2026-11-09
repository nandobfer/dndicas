import { z } from "zod"
import { MADDOX_ABILITY_METHODS, MADDOX_OPEX_MEMORIES_PER_TURN, MADDOX_OPEX_MEMORY_TEXT_EXPECTED, MADDOX_OPEX_MEMORY_TEXT_GUARD, MADDOX_OPEX_MEMORY_TITLE_MAX, MADDOX_PROFILE_SECTIONS, type MaddoxRigorLevel } from "../constants"
import { ABILITY_LABEL_LIST } from "../interview-scores"
import { rigorBlock } from "./interview-prompt"

/**
 * Prompts e contratos do Personagem Opex (DND-26) — módulo PURO.
 *
 * O Opex é o JOGADOR de um personagem: decide só as ações, falas e escolhas dele, sempre por uma saída JSON validada
 * (todos os provedores, inclusive o OpenCode, sem ferramentas). Cada decisão leva as instruções da configuração, a regra
 * fixa do papel, as memórias dos 3 canais (global, Jogadores e individual), a campanha e o personagem.
 */

export const MADDOX_OPEX_ROLE_RULE = [
    "## Seu papel",
    "- Você é o jogador que controla este personagem numa campanha narrada pelo Maddox, o mestre. Você NÃO é o mestre: nunca narre resultados, nunca decida pelo mundo, pelos NPCs ou pelos outros personagens.",
    "- Decida como o personagem decidiria: coerente com a personalidade, a história, as motivações, os medos e as relações dele.",
    "- O que o prompt base do dono não define, decida você, de forma adequada ao cenário e ao tema da campanha.",
    "- Responda SEMPRE e SOMENTE com o objeto JSON pedido na tarefa, sem texto antes ou depois.",
].join("\n")

export const MADDOX_OPEX_MEMORY_RULE = [
    "## Suas memórias",
    `- A cada declaração você pode guardar até ${MADDOX_OPEX_MEMORIES_PER_TURN} memórias suas no campo "memorias": sentimentos, planos, motivações, opiniões sobre o que aconteceu e sobre os outros personagens, e relacionamentos.`,
    "- NÃO guarde fatos que já estão nas memórias da campanha (canal Jogadores): lugares, missões, eventos e fatos públicos já registrados. Guarde o que é SEU: o que o personagem sente, pensa e pretende.",
    "- Use um título curto e estável por assunto (ex.: \"Confiança em Lyra\"): o mesmo título atualiza a memória, em vez de criar outra.",
    `- Cada memória tem até ${MADDOX_OPEX_MEMORY_TEXT_EXPECTED} caracteres: uma ou duas frases completas, sem cortar no meio.`,
].join("\n")

export interface OpexPromptCampaign {
    name: string
    rigor: MaddoxRigorLevel
    setting: string
    openingSituation: string
    state: { scene: string; location: string; situation: string; pendingDecision: string }
}

export interface OpexPromptCharacter {
    name: string
    profile: Record<string, string>
    currentState: string
    sheet: string | null
}

export interface OpexPromptContext {
    instructions: string
    memories: string
    basePrompt: string
    campaign: OpexPromptCampaign
    character: OpexPromptCharacter | null
}

function characterSection(character: OpexPromptCharacter | null, basePrompt: string): string {
    const base = basePrompt.trim() ? `### Prompt base do dono da campanha\n${basePrompt.trim()}` : "### Prompt base do dono da campanha\n(nenhum: você decide tudo, inclusive o nome)"
    if (!character || !character.name) return ["## Seu personagem", "Ainda em criação (a entrevista com o Maddox define o personagem).", base].join("\n\n")
    const sections = MADDOX_PROFILE_SECTIONS.map((section) => (character.profile[section.key]?.trim() ? `### ${section.label}\n${character.profile[section.key]!.trim()}` : null)).filter(Boolean)
    return [
        `## Seu personagem: ${character.name}`,
        ...sections,
        `### Condição atual\n${character.currentState.trim() || "(sem mudanças registradas)"}`,
        ...(character.sheet ? [`### Ficha\n${character.sheet}`] : []),
        base,
    ].join("\n\n")
}

function campaignSection(campaign: OpexPromptCampaign): string {
    const state = [
        campaign.state.scene && `- Cena: ${campaign.state.scene}`,
        campaign.state.location && `- Local: ${campaign.state.location}`,
        campaign.state.situation && `- Situação: ${campaign.state.situation}`,
        campaign.state.pendingDecision && `- Decisão aguardada: ${campaign.state.pendingDecision}`,
    ].filter(Boolean)
    return [
        `## Campanha: ${campaign.name}`,
        rigorBlock(campaign.rigor),
        `### Cenário\n${campaign.setting.trim() || "(ainda não registrado)"}`,
        ...(campaign.openingSituation.trim() ? [`### Situação inicial\n${campaign.openingSituation.trim()}`] : []),
        ...(state.length ? [`### Situação atual\n${state.join("\n")}`] : []),
    ].join("\n\n")
}

/** Instruções de toda decisão do Opex. */
export function buildOpexInstructions(context: OpexPromptContext, options: { withMemoryRule?: boolean } = {}): string {
    return [
        context.instructions.trim(),
        MADDOX_OPEX_ROLE_RULE,
        ...(options.withMemoryRule ? [MADDOX_OPEX_MEMORY_RULE] : []),
        ...(context.memories.trim() ? [`## Memórias (global do Personagem Opex, campanha e as suas)\n${context.memories.trim()}`] : []),
        campaignSection(context.campaign),
        characterSection(context.character, context.basePrompt),
    ].join("\n\n")
}

// ── Entrevista ──────────────────────────────────────────────────────────────

export interface OpexInterviewTask {
    transcript: string
    /** Orientação do dono ("Gerar outra resposta"). */
    guidance?: string | null
    /** Pedido de ajuste depois de a conclusão ser recusada (modo autônomo). */
    fix?: string | null
}

export function opexInterviewReplyTask(task: OpexInterviewTask): string {
    return [
        "## Tarefa: responder ao Maddox na entrevista de personagem",
        "O Maddox está entrevistando você para criar o seu personagem. Responda à última fala dele como o jogador, em primeira pessoa, com as escolhas do personagem. Seja colaborativo e decidido: escolha em vez de devolver perguntas; aceite ou ajuste as sugestões dele. Quando ele apresentar a síntese, confirme ou peça só o ajuste necessário.",
        "Escolha um NOME para o personagem quando o Maddox pedir (ou antes, se ainda não houver).",
        ...(task.fix ? [`### Ajuste necessário\nA conclusão foi recusada: ${task.fix}\nPeça ao Maddox, na sua resposta, para resolver isso.`] : []),
        ...(task.guidance ? [`### Orientação do dono da campanha\n${task.guidance}`] : []),
        `### Conversa até agora\n${task.transcript || "(o Maddox ainda não falou)"}`,
        'Responda só com: {"resposta": "sua fala ao Maddox (Markdown simples, até uns 2 parágrafos)"}',
    ].join("\n\n")
}

export function opexAbilityScoresTask(task: OpexInterviewTask & { reason: string | null; rolled: number[] | null }): string {
    const labels = ABILITY_LABEL_LIST.join(", ")
    return [
        "## Tarefa: definir os atributos do personagem (card de atributos)",
        task.reason ? `O Maddox abriu o card de atributos: ${task.reason}` : "O Maddox abriu o card de atributos.",
        task.rolled
            ? `Você escolheu o método de rolagem e o servidor rolou estas seis pontuações: ${task.rolled.join(", ")}. Distribua exatamente essas pontuações, uma por atributo, de acordo com a classe e o estilo do personagem.`
            : [
                  "Escolha um método e distribua os valores de acordo com a classe e o estilo do personagem:",
                  '- "standard": conjunto padrão — use 15, 14, 13, 12, 10 e 8, cada um uma vez;',
                  '- "point-buy": compra de pontos — cada atributo entre 8 e 15, custo total até 27 (9→1, 10→2, 11→3, 12→4, 13→5, 14→7, 15→9 pontos acima de 8);',
                  '- "roll": rolagem de 4d6 no servidor — mande só o método (os valores vêm depois, já rolados).',
              ].join("\n"),
        ...(task.guidance ? [`### Orientação do dono da campanha\n${task.guidance}`] : []),
        `### Conversa até agora\n${task.transcript}`,
        `Responda só com: {"metodo": "${task.rolled ? "roll" : "standard | point-buy | roll"}", "valores": { ${labels.split(", ").map((label) => `"${label}": número`).join(", ")} }}`,
    ].join("\n\n")
}

export function opexHitPointsTask(task: OpexInterviewTask & { levels: number[]; hitDie: string; reason: string | null }): string {
    return [
        "## Tarefa: pontos de vida por nível (card de PV)",
        `${task.reason ? `${task.reason}\n` : ""}Para cada nível de ${task.levels[0]} a ${task.levels[task.levels.length - 1]}, escolha "media" (ganho garantido) ou "rolagem" (rola 1 ${task.hitDie} no servidor).`,
        ...(task.guidance ? [`### Orientação do dono da campanha\n${task.guidance}`] : []),
        `Responda só com: {"escolhas": { ${task.levels.map((level) => `"${level}": "media" | "rolagem"`).join(", ")} }}`,
    ].join("\n\n")
}

const textField = z.string().trim()
export const opexInterviewReplySchema = z.object({ resposta: textField.min(1) })
export const opexAbilityScoresSchema = z.object({ metodo: z.enum(MADDOX_ABILITY_METHODS), valores: z.record(z.string(), z.number().int()).optional().default({}) })
export const opexHitPointsSchema = z.object({ escolhas: z.record(z.string().regex(/^\d+$/), z.enum(["media", "rolagem"])) })

// ── Mesa ────────────────────────────────────────────────────────────────────

export interface OpexTableTask {
    turnNumber: number
    transcript: string
    questionsLeft: number
    /** Motivo da recusa da declaração anterior (Rigoroso e Fiel). */
    invalidReason?: string | null
}

export function opexTableTask(task: OpexTableTask): string {
    return [
        `## Tarefa: o seu turno (turno ${task.turnNumber})`,
        "Os outros jogadores já agiram neste turno (o que você pode ver está na transcrição). Agora é a sua vez, antes de o Maddox narrar tudo junto. Leve em conta o que o grupo fez.",
        task.questionsLeft > 0
            ? `Você pode PERGUNTAR algo ao mestre antes de agir (resta${task.questionsLeft > 1 ? "m" : ""} ${task.questionsLeft} pergunta${task.questionsLeft > 1 ? "s" : ""}): use "perguntar" só quando a resposta mudar a sua decisão.`
            : "Você já usou as suas perguntas: agora declare ou não faça nada.",
        '"declarar": diga o que o personagem tenta fazer e como, em primeira pessoa, em uma a três frases (uma tentativa, nunca o resultado). "nada": o personagem não faz nada neste turno.',
        ...(task.invalidReason ? [`### A sua declaração anterior foi recusada pelo Maddox\n${task.invalidReason}\nDeclare outra ação possível para o personagem.`] : []),
        `### Transcrição recente\n${task.transcript || "(início da campanha)"}`,
        `Responda só com: {"acao": "perguntar" | "declarar" | "nada", "texto": "a pergunta ou a declaração (vazio em nada)", "memorias": [{"titulo": "...", "texto": "..."}]}`,
    ].join("\n\n")
}

export const opexMemorySchema = z.object({ titulo: textField.min(1).max(MADDOX_OPEX_MEMORY_TITLE_MAX * 2), texto: textField.min(1) })
export const opexTableActionSchema = z.object({
    acao: z.enum(["perguntar", "declarar", "nada"]),
    texto: z.string().optional().default(""),
    memorias: z.array(opexMemorySchema).optional().default([]),
})
export type OpexTableAction = z.infer<typeof opexTableActionSchema>

/** Memórias do Opex prontas para gravar (corte de proteção, sem invalidar a decisão). */
export function opexMemoriesOf(action: Pick<OpexTableAction, "memorias">): { title: string; text: string }[] {
    return action.memorias.slice(0, MADDOX_OPEX_MEMORIES_PER_TURN).map((memory) => ({ title: memory.titulo.slice(0, MADDOX_OPEX_MEMORY_TITLE_MAX).trim(), text: memory.texto.slice(0, MADDOX_OPEX_MEMORY_TEXT_GUARD).trim() }))
}

// ── Combate tático ──────────────────────────────────────────────────────────

export interface OpexCombatOptionLine {
    id: string
    economy: "action" | "bonus"
    label: string
    detail: string
    target: string
    levels?: number[]
    skills?: string[]
    needsText?: boolean
}

export interface OpexCombatTask {
    round: number
    situation: string
    options: OpexCombatOptionLine[]
    targets: { key: string; name: string; side: "inimigo" | "aliado" | "você" }[]
    economy: { action: boolean; bonus: boolean }
    previousError?: string | null
}

export function opexCombatTask(task: OpexCombatTask): string {
    const lines = task.options.map(
        (option) =>
            `- [${option.economy === "action" ? "Ação" : "Ação bônus"}] id="${option.id}" — ${option.label}${option.detail ? ` (${option.detail})` : ""}; alvo: ${option.target}${option.levels?.length ? `; círculos: ${option.levels.join(", ")}` : ""}${option.skills?.length ? `; perícias: ${option.skills.join(", ")}` : ""}${option.needsText ? "; exige texto (descreva a ação)" : ""}`,
    )
    return [
        `## Tarefa: a vez do seu personagem no combate (rodada ${task.round})`,
        "Escolha o que o personagem faz nesta vez, usando SÓ as opções abaixo (as mesmas que a ficha permite a um jogador). Você tem uma Ação e uma Ação bônus; pode usar as duas, só uma ou nenhuma, e descrever o movimento.",
        `### Situação\n${task.situation}`,
        `### Disponível agora: ${[task.economy.action ? "Ação" : null, task.economy.bonus ? "Ação bônus" : null].filter(Boolean).join(" e ") || "nada"}`,
        `### Opções\n${lines.join("\n") || "(nenhuma)"}`,
        `### Alvos (use a chave)\n${task.targets.map((target) => `- "${target.key}": ${target.name} (${target.side})`).join("\n") || "(nenhum)"}`,
        ...(task.previousError ? [`### A escolha anterior foi recusada\n${task.previousError}\nEscolha outra opção.`] : []),
        'Responda só com: {"acoes": [{"economia": "action" | "bonus", "opcao": "id da opção", "alvos": ["chave"], "circulo": número opcional, "pericia": "opcional", "texto": "opcional"}], "movimento": "como o personagem se move e se posiciona (opcional)"}',
    ].join("\n\n")
}

export const opexCombatPlanSchema = z.object({
    acoes: z
        .array(
            z.object({
                economia: z.enum(["action", "bonus"]),
                opcao: z.string().trim().min(1),
                alvos: z.array(z.string()).optional().default([]),
                circulo: z.number().int().optional(),
                pericia: z.string().optional(),
                texto: z.string().optional(),
            }),
        )
        .max(4)
        .optional()
        .default([]),
    movimento: z.string().optional().default(""),
})
export type OpexCombatPlan = z.infer<typeof opexCombatPlanSchema>

export function opexReactionTask(input: { trigger: string; options: { id: string; label: string }[]; situation: string }): string {
    return [
        "## Tarefa: reação",
        `Algo aconteceu e o seu personagem pode reagir: ${input.trigger}`,
        `### Situação\n${input.situation}`,
        `### Opções\n${input.options.map((option) => `- "${option.id}": ${option.label}`).join("\n")}\n- "none": não reagir`,
        'Responda só com: {"escolha": "id da opção ou none"}',
    ].join("\n\n")
}

export const opexReactionSchema = z.object({ escolha: z.string().trim().min(1) })

// ── NPC Opex (DND-27) ───────────────────────────────────────────────────────

export const MADDOX_OPEX_NPC_ROLE_RULE = [
    "## Seu papel",
    "- Você é um NPC da campanha narrada pelo Maddox, o mestre. Você NÃO é um jogador nem o mestre.",
    "- Decida só as falas e as ações deste NPC, como ele decidiria: coerente com quem ele é, o que sabe, o que quer e o que esconde.",
    "- Nunca narre resultados, nunca decida pelo mundo, pelos outros NPCs ou pelos personagens dos jogadores: o mestre resolve o que acontece a partir da sua decisão.",
    "- Você só sabe o que o NPC viveu (as suas memórias) e o que o mestre conta da cena. Não invente fatos do mundo além disso.",
    "- Responda SEMPRE e SOMENTE com o objeto JSON pedido na tarefa, sem texto antes ou depois.",
].join("\n")

export const MADDOX_OPEX_NPC_MEMORY_RULE = [
    "## Suas memórias",
    `- A cada consulta você pode guardar até ${MADDOX_OPEX_MEMORIES_PER_TURN} memórias suas no campo "memorias": o que viveu, decidiu ou descobriu, o que sente e planeja, e as suas relações com os personagens.`,
    "- Use um título curto e estável por assunto (ex.: \"Desconfiança do grupo\"): o mesmo título atualiza a memória, em vez de criar outra.",
    `- Cada memória tem até ${MADDOX_OPEX_MEMORY_TEXT_EXPECTED} caracteres: uma ou duas frases completas, sem cortar no meio.`,
].join("\n")

export interface OpexNpcPromptContext {
    instructions: string
    memories: string
    npc: { name: string; publicDescription: string }
    campaign: OpexPromptCampaign
}

/** Instruções de toda decisão do NPC Opex: configuração, papel de NPC, memórias dos 2 canais, campanha e o NPC. */
export function buildOpexNpcInstructions(context: OpexNpcPromptContext): string {
    return [
        context.instructions.trim(),
        MADDOX_OPEX_NPC_ROLE_RULE,
        MADDOX_OPEX_NPC_MEMORY_RULE,
        ...(context.memories.trim() ? [`## Memórias (global dos NPCs Opex e as suas)\n${context.memories.trim()}`] : []),
        campaignSection(context.campaign),
        [`## Você é: ${context.npc.name}`, context.npc.publicDescription.trim() || "(sem descrição registrada)"].join("\n\n"),
    ].join("\n\n")
}

export interface OpexNpcSceneTask {
    /** O que o NPC percebe da cena, contado pelo Maddox. */
    situation: string
    /** Pergunta direta do Maddox (opcional). */
    question?: string | null
}

export function opexNpcSceneTask(task: OpexNpcSceneTask): string {
    return [
        "## Tarefa: o que você fala e faz nesta cena",
        "O mestre está narrando uma cena em que você aparece ou interage com os personagens. Decida o que você FALA (em primeira pessoa, como o NPC falaria) e o que você FAZ (uma tentativa, nunca o resultado).",
        `### A cena (o que você percebe)\n${task.situation.trim()}`,
        ...(task.question?.trim() ? [`### O mestre pergunta\n${task.question.trim()}`] : []),
        'Responda só com: {"fala": "o que você diz (vazio se ficar calado)", "acao": "o que você faz", "memorias": [{"titulo": "...", "texto": "..."}]}',
    ].join("\n\n")
}

export const opexNpcSceneSchema = z
    .object({
        fala: z.string().optional().default(""),
        acao: z.string().optional().default(""),
        memorias: z.array(opexMemorySchema).optional().default([]),
    })
    .refine((value) => Boolean(value.fala.trim() || value.acao.trim()), { message: "Diga uma fala ou uma ação" })
export type OpexNpcSceneDecision = z.infer<typeof opexNpcSceneSchema>

export interface OpexNpcCombatOption {
    name: string
    detail: string
}

export interface OpexNpcCombatTask {
    round: number
    situation: string
    options: readonly OpexNpcCombatOption[]
    targets: readonly { name: string; side: string; health: string }[]
}

export function opexNpcCombatTask(task: OpexNpcCombatTask): string {
    return [
        `## Tarefa: a sua vez no combate (rodada ${task.round})`,
        "Escolha o que você faz nesta vez, usando SÓ uma das opções abaixo (as da sua ficha). O mestre resolve as rolagens e narra o resultado.",
        `### Situação\n${task.situation.trim() || "(sem detalhes)"}`,
        `### Opções (use o nome exato)\n${task.options.map((option) => `- "${option.name}"${option.detail ? ` — ${option.detail}` : ""}`).join("\n") || "(nenhuma)"}`,
        `### Quem está no combate\n${task.targets.map((target) => `- "${target.name}" (${target.side}; ${target.health})`).join("\n") || "(ninguém)"}`,
        'Responda só com: {"acao": "nome exato de uma opção", "alvos": ["nome exato"], "fala": "o que você diz (opcional)", "memorias": [{"titulo": "...", "texto": "..."}]}',
    ].join("\n\n")
}

const sameName = (a: string, b: string) => a.trim().toLocaleLowerCase("pt-BR") === b.trim().toLocaleLowerCase("pt-BR")

/** Decisão do NPC Opex no combate: só vale com `acao` entre as opções (a grafia volta à da opção). */
export function opexNpcCombatSchema(options: readonly OpexNpcCombatOption[]) {
    return z
        .object({
            acao: z.string().trim().min(1),
            alvos: z.array(z.string()).optional().default([]),
            fala: z.string().optional().default(""),
            memorias: z.array(opexMemorySchema).optional().default([]),
        })
        .refine((value) => options.some((option) => sameName(option.name, value.acao)), { message: "Ação fora das opções", path: ["acao"] })
        .transform((value) => ({ ...value, acao: options.find((option) => sameName(option.name, value.acao))!.name }))
}
export type OpexNpcCombatDecision = z.infer<ReturnType<typeof opexNpcCombatSchema>>
