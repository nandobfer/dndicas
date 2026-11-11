import { randomUUID } from "node:crypto"
import type { MaddoxRigorLevel } from "../constants"
import {
    MADDOX_CATALOG_TOOL_NAMES,
    MADDOX_COMBAT_ADJUST_CONSUMPTION_ORIGIN,
    MADDOX_COMBAT_ADJUST_MAX_STEPS,
    MADDOX_COMBAT_ADJUST_TIMEOUT_MS,
    MADDOX_COMBAT_DOWNED_CHECK_TIMEOUT_MS,
    MADDOX_COMBAT_PREP_CONSUMPTION_ORIGIN,
    MADDOX_COMBAT_PREP_MAX_STEPS,
    MADDOX_COMBAT_PREP_TIMEOUT_MS,
    MADDOX_MCP_SERVER_NAME,
    MADDOX_JEV_MODEL,
    MADDOX_SNEAK_ATTACK_CHECK_TIMEOUT_MS,
    MADDOX_SNEAK_ATTACK_CONSUMPTION_ORIGIN,
} from "../constants"
import { closeCatalogRun, openCatalogRun, recordCatalogToolResult, type CatalogReadLog } from "./catalog-reads"

/**
 * Chamadas de IA da preparação da mesa de combate (DND-41) — SOMENTE servidor. Usa o mesmo modelo do narrador no grau
 * da campanha (`loadNarrator`) e as instruções configuráveis da aba Agente Maddox; o contrato JSON fica fixo aqui. As
 * decisões de sim/não (condição do ataque furtivo, filtro do pedido de ajuste) usam o JEV quando a chave está ligada.
 * Testes mockam este módulo inteiro (nunca há rede).
 */

export interface PrepCampaign {
    _id: unknown
    name: string
    rigor: MaddoxRigorLevel
    setting?: string | null
    state?: { situation?: string | null } | null
}

/** Rejeita no teto, mesmo que o provedor ignore o sinal (a vaga da fila é liberada). */
export async function withTimeout<T>(ms: number, label: string, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | null = null
    const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
            controller.abort()
            reject(new Error(`${label} passou de ${Math.round(ms / 1000)} s`))
        }, ms)
    })
    try {
        return await Promise.race([run(controller.signal), timeout])
    } finally {
        if (timer) clearTimeout(timer)
    }
}

const SOURCE_FIELD = '"source":{"ref":"Tipo:id da entidade lida","quote":"trecho exato do texto dela"}'

const SHEET_CHANGE_CONTRACT = [
    '"sheetChanges": correções na ficha, cada uma com "type", os campos dela e "reason" (motivo curto, falando com o jogador, citando a regra e a fonte). Tipos permitidos:',
    `  - {"type":"ability","attribute":"strength|dexterity|constitution|intelligence|wisdom|charisma","value":1-30,${SOURCE_FIELD}}`,
    `  - {"type":"save-proficiency","attribute":"…","proficient":true|false,${SOURCE_FIELD}}`,
    `  - {"type":"skill-proficiency","skill":"nome da perícia como na ficha","proficient":true|false,"expertise":true|false,${SOURCE_FIELD}}`,
    `  - {"type":"spellcasting-attribute","attribute":"…"|null,${SOURCE_FIELD}}`,
    `  - {"type":"spell-slots","circle":1-9,"total":0-9,${SOURCE_FIELD}}`,
    `  - {"type":"charge-upsert","chargeId":"id existente (opcional)","name":"…","total":n,"used":n,${SOURCE_FIELD}}`,
    `  - {"type":"attack-upsert","attackId":"id existente (opcional)","name":"…","attackBonus":n,"damage":{"quantity":n,"faces":4|6|8|10|12|20,"bonus":n,"type":"perfurante"},${SOURCE_FIELD}}`,
    `  - {"type":"weapon-mastery","catalogItemId":"catalogItemId do item da ficha","mastery":"nick|vex|sap|topple|graze|push|slow|cleave",${SOURCE_FIELD}} (fonte = a característica de classe que dá a maestria, com o trecho do número de armas)`,
    '  - {"type":"attack-remove","attackId":"id"}',
    '  - {"type":"trait-upsert"|"feat-upsert","id":"id existente (opcional)","name":"…","description":"…","ref":"c1 (opcional, para ligar a uma opção acrescentada)"}',
    '  - {"type":"spell-update","spellId":"id","prepared":true|false,"circle":0-9}',
    '  - {"type":"item-equip","itemId":"id","equipped":true|false}',
    '  - {"type":"text-append","field":"classFeatures|speciesTraits|featuresNotes|weaponProficiencies|notes","text":"…"}',
]

const OPTION_CONTRACT = [
    `"modify": opções que o servidor já mostra e precisam de correção: {"optionId":"id da lista","label"?,"detail"?,"economy"?:"action|bonus","attack"?:{"bonus":n,"damage":"1d4+3","damageType":"perfurante","ranged":bool,"light":bool,"finesse":bool},"save"?:{"ability":"…","dc":n,"halfOnSave":bool,"damage":"2d6"|null,"damageType":…},"heal"?:{"dice":"1d8+2"},"reason":"…",${SOURCE_FIELD} (obrigatório com attack, save, heal ou economy)}`,
    '"remove": opções que a ficha não permite: {"optionId":"…","reason":"…"}',
    `"add": opções que a ficha permite e faltam: {"id":"slug-curto","category":"weapons|spells|items|abilities|other","economy":"action|bonus|reaction","label":"…","detail":"…","target":"enemy|ally|self|any|none","resolution":"attack|save|heal|auto|utility","attack"?,"save"?,"heal"?,"chargeId"?:"id do recurso que gasta","itemId"?:"id do item que gasta","spellCircle"?:n,"fromChange"?:"ref da criação na ficha","reason":"…",${SOURCE_FIELD} (obrigatório com attack, save ou heal)}`,
    "As ações padrão (Esconder-se, Esquivar, Disparada…), o ataque desarmado, o ataque de oportunidade, \"Outra ação\" e os ataques das maestrias (Ágil, Trespassar) são do servidor: não os altere, não os remova e não os acrescente.",
    "Use os ids exatamente como aparecem na ficha e na lista. Não crie números que a ficha e o catálogo não sustentem.",
]

/** Regras de fonte, fixas no código (valem mesmo com instruções antigas salvas na aba Agente Maddox). */
const SOURCE_RULES = [
    "## Fonte das regras (obrigatória)",
    `Consulte o catálogo do DnDicas com ${MADDOX_CATALOG_TOOL_NAMES.search} e ${MADDOX_CATALOG_TOOL_NAMES.get} (use os ids das Referências do catálogo da ficha) ANTES de qualquer alteração de regra. Toda alteração de número ou de regra leva "source" com o "ref" (Tipo:id de uma entidade lida com ${MADDOX_CATALOG_TOOL_NAMES.get} nesta resposta) e o "quote" (trecho copiado literalmente do texto dela).`,
    "O servidor confere cada fonte: sem source, com ref não lido ou com trecho que não está no texto, a alteração é recusada. Sem a regra no catálogo, não altere: deixe o valor do servidor e diga, no reason, que falta cadastro.",
].join("\n")

interface CatalogGeneration {
    campaign: PrepCampaign
    instructions: string
    prompt: string
    title: string
    origin: string
    signal: AbortSignal
    /** Registro das consultas desta execução (fonte das alterações de regra). */
    reads: CatalogReadLog
    /** Job da fila da campanha (o token do MCP só vale enquanto ele roda). */
    jobId: string
    maxSteps: number
}

/** Geração curta do narrador, sem ferramentas (condição do ataque furtivo, checagem de quem está a 0 PV). */
async function narratorText(campaign: PrepCampaign, instructions: string, prompt: string, title: string, origin: string, signal: AbortSignal): Promise<string> {
    const [{ loadNarrator }, { generateAiText }] = await Promise.all([import("./narrator"), import("@/lib/ai/stream")])
    const { model } = await loadNarrator(campaign.rigor)
    const { text } = await generateAiText({
        provider: model.provider,
        model: model.model,
        agent: model.agent,
        variant: model.variant,
        instructions,
        prompt,
        title,
        consumption: { origin, subject: String(campaign._id) },
        signal,
    })
    return text
}

/**
 * Geração com as ferramentas de catálogo (DND-49): na AI SDK, `search_catalog`/`get_catalog_entity` entram na chamada;
 * no OpenCode, pelo MCP `dndicas-maddox` com o token de catálogo desta execução. Cada leitura entra em `reads`.
 * Devolve o texto do último passo (o JSON da resposta).
 */
async function catalogGeneration(input: CatalogGeneration): Promise<string> {
    const { loadNarrator } = await import("./narrator")
    const { settings, model } = await loadNarrator(input.campaign.rigor)
    if (model.provider === "opencode") {
        const [{ ensureMaddoxMcp }, { createMaddoxCatalogToken }, { generateAiText }] = await Promise.all([import("./opencode-mcp"), import("./master-turn-token"), import("@/lib/ai/stream")])
        await ensureMaddoxMcp(settings)
        const runId = randomUUID()
        const token = createMaddoxCatalogToken({ campaignId: String(input.campaign._id), jobId: input.jobId, runId })
        const tools = [
            "## Ferramentas",
            `As ferramentas de catálogo (${MADDOX_CATALOG_TOOL_NAMES.search} e ${MADDOX_CATALOG_TOOL_NAMES.get}) vêm do servidor MCP \`${MADDOX_MCP_SERVER_NAME}\`.`,
            `- Em TODA chamada a essas ferramentas, envie o campo \`turno\` exatamente com este valor: \`${token}\`.`,
            "- Use só as ferramentas de catálogo nesta resposta.",
        ].join("\n")
        openCatalogRun(runId, input.reads)
        try {
            const { text } = await generateAiText({
                provider: "opencode",
                model: model.model,
                agent: model.agent,
                variant: model.variant,
                instructions: `${input.instructions}\n\n${tools}`,
                prompt: input.prompt,
                title: input.title,
                consumption: { origin: input.origin, subject: String(input.campaign._id) },
                signal: input.signal,
            })
            return text
        } finally {
            closeCatalogRun(runId)
        }
    }
    const [{ generateText, stepCountIs }, { prepareModel, samplingOptions, describeAiError }, { buildCatalogAiTools }, { recordAiConsumption }, { stepCostUsd }] = await Promise.all([
        import("ai"),
        import("@/lib/ai/stream"),
        import("./catalog-tools"),
        import("@/lib/ai/consumption"),
        import("@/lib/ai/step-cost"),
    ])
    const prepared = await prepareModel({ provider: model.provider, model: model.model, variant: model.variant, sessionKey: `maddox:${String(input.campaign._id)}:combat-prep` })
    try {
        const tools = await buildCatalogAiTools({
            onResult: (_tool, output) => recordCatalogToolResult(input.reads, output),
            onError: (tool) => {
                if (tool === MADDOX_CATALOG_TOOL_NAMES.get) input.reads.failures += 1
            },
        })
        const result = await generateText({
            model: prepared.model,
            instructions: input.instructions,
            messages: [{ role: "user", content: input.prompt }],
            tools,
            stopWhen: stepCountIs(input.maxSteps),
            abortSignal: input.signal,
            providerOptions: prepared.providerOptions,
            ...(prepared.reasoning ? { reasoning: prepared.reasoning } : {}),
            ...samplingOptions({ provider: model.provider, variant: model.variant, temperature: model.temperature, maxOutputTokens: model.maxOutputTokens }),
        })
        let costUsd: number | null = null
        for (const step of result.steps) {
            const cost = stepCostUsd(step.providerMetadata)
            if (cost !== null) costUsd = (costUsd ?? 0) + cost
        }
        const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null)
        await recordAiConsumption({
            dedupKey: `${input.origin}:${randomUUID()}`,
            provider: model.provider,
            origin: input.origin,
            subject: String(input.campaign._id),
            model: model.model,
            inputTokens: num(result.totalUsage.inputTokens),
            outputTokens: num(result.totalUsage.outputTokens),
            totalTokens: num(result.totalUsage.totalTokens),
            costUsd,
        })
        const last = [...result.steps].reverse().find((step) => step.text.trim())
        return last?.text ?? result.text
    } catch (error) {
        throw new Error(describeAiError(error, model))
    } finally {
        await prepared.dispose().catch(() => undefined)
    }
}

export interface ReviewSheetInput {
    campaign: PrepCampaign
    characterName: string
    /** Ficha inteira em texto (atributos, proficiências, ataques, itens com propriedades, características, magias, recursos). */
    sheetText: string
    /** Lista que o servidor calculou (id, economia, rótulo, detalhe). */
    optionsText: string
    /** Ataque furtivo detectado pelo servidor ("1d6" ou nenhum). */
    sneakAttack: string | null
    /** DND-49: registro das consultas ao catálogo desta execução. */
    reads: CatalogReadLog
    /** DND-49: job da fila da campanha (token do MCP no OpenCode). */
    jobId: string
}

/** Revisão da mesa de UM personagem. Devolve o objeto JSON da resposta (validado por quem chama). */
export async function reviewCombatSheet(input: ReviewSheetInput): Promise<unknown> {
    const [{ loadMaddoxSettings }, { rigorBlock, parseJsonObject }] = await Promise.all([import("./settings"), import("./interview-prompt")])
    const { settings } = await loadMaddoxSettings()
    const instructions = [
        settings.combatPrepInstructions,
        rigorBlock(input.campaign.rigor),
        "## Formato da resposta",
        "Responda SOMENTE com um objeto JSON com as chaves abaixo (listas vazias quando não houver nada a mudar):",
        SOURCE_RULES,
        "## Formato da resposta (continuação)",
        ...SHEET_CHANGE_CONTRACT,
        ...OPTION_CONTRACT,
        `"sneakAttack": {"dice":"Xd6"|null,"reason":"…",${SOURCE_FIELD}} só quando o ataque furtivo detectado pelo servidor estiver errado pelo catálogo (dados diferentes, ou o personagem não o tem); omita se estiver certo.`,
    ].join("\n\n")
    const prompt = [
        `# Personagem: ${input.characterName}`,
        input.sheetText,
        "## Opções calculadas pelo servidor",
        input.optionsText,
        `## Ataque furtivo detectado pelo servidor: ${input.sneakAttack ? `+${input.sneakAttack}` : "nenhum"}`,
    ].join("\n\n")
    const text = await withTimeout(MADDOX_COMBAT_PREP_TIMEOUT_MS, "a preparação da ficha", (signal) =>
        catalogGeneration({ campaign: input.campaign, instructions, prompt, title: `Maddox · preparação do combate · ${input.campaign.name}`, origin: MADDOX_COMBAT_PREP_CONSUMPTION_ORIGIN, signal, reads: input.reads, jobId: input.jobId, maxSteps: MADDOX_COMBAT_PREP_MAX_STEPS }),
    )
    return parseJsonObject(text)
}

export interface ReviewAdjustmentInput extends ReviewSheetInput {
    /** A opção atual (como o jogador a vê). */
    optionText: string
    request: string
    /** Pedidos anteriores e o que o Maddox decidiu. */
    previous: string
}

/** Pedido de ajuste: `{ decision, reason, sheetChanges, modify, remove, add }`. */
export async function reviewAdjustment(input: ReviewAdjustmentInput): Promise<unknown> {
    const [{ loadMaddoxSettings }, { rigorBlock, parseJsonObject }] = await Promise.all([import("./settings"), import("./interview-prompt")])
    const { settings } = await loadMaddoxSettings()
    const instructions = [
        settings.combatAdjustInstructions,
        rigorBlock(input.campaign.rigor),
        "## Formato da resposta",
        'Responda SOMENTE com um objeto JSON: {"decision":"accept"|"refuse","reason":"motivo em uma ou duas frases, falando com o jogador e citando a regra e a fonte", e, quando aceitar, as correções:}',
        SOURCE_RULES,
        "Se a regra que o jogador cita bate com o catálogo, aceite com a fonte. Se ela não existe no catálogo, recuse e diga o motivo.",
        ...SHEET_CHANGE_CONTRACT,
        ...OPTION_CONTRACT,
        "Ao aceitar, corrija a opção pedida (modify, remove ou add) e grave a correção na ficha quando ela estiver errada lá. Ao recusar, deixe as listas vazias.",
    ].join("\n\n")
    const prompt = [
        `# Personagem: ${input.characterName}`,
        input.sheetText,
        "## Opções atuais",
        input.optionsText,
        "## Opção do pedido",
        input.optionText,
        ...(input.previous ? ["## Pedidos anteriores nesta preparação", input.previous] : []),
        `## Pedido do jogador\n${input.request}`,
    ].join("\n\n")
    const text = await withTimeout(MADDOX_COMBAT_ADJUST_TIMEOUT_MS, "o pedido de ajuste", (signal) =>
        catalogGeneration({ campaign: input.campaign, instructions, prompt, title: `Maddox · ajuste no combate · ${input.campaign.name}`, origin: MADDOX_COMBAT_ADJUST_CONSUMPTION_ORIGIN, signal, reads: input.reads, jobId: input.jobId, maxSteps: MADDOX_COMBAT_ADJUST_MAX_STEPS }),
    )
    return parseJsonObject(text)
}

export interface DownedCharacterInput {
    campaign: PrepCampaign
    characterName: string
    /** Condição atual do personagem na história (`currentState`). */
    currentState: string
    /** Narração e declarações recentes. */
    recent: string
}

/**
 * Checagem ao abrir o combate tático (DND-49, decisão do dono D3: no job da preparação do próprio personagem, antes da
 * iniciativa fechar): o personagem está a 0 PV na ficha; pela história recente, ele se recuperou? Devolve o JSON
 * `{ decisao: "manter" | "aplicar", operacao?, dados?, valor?, motivo }` (validado por quem chama).
 */
export async function reviewDownedCharacter(input: DownedCharacterInput): Promise<unknown> {
    const { parseJsonObject, rigorBlock } = await import("./interview-prompt")
    const instructions = [
        "Você é Maddox, o mestre da campanha. Um combate tático vai começar e um personagem jogador está com 0 PV na ficha. Pela condição dele na história e pelo que aconteceu recentemente, decida pelas regras do D&D se ele já se recuperou antes desta luta (foi curado, estabilizado e acordou, descansou) ou se segue caído.",
        rigorBlock(input.campaign.rigor),
        "Só aplique uma recuperação que a história mostre e que a regra permita; na dúvida, mantenha caído.",
        'Responda SOMENTE com um objeto JSON: {"decisao":"manter"|"aplicar","operacao":"curar|definir|estabilizar|acordar|descanso-curto|descanso-longo" (quando aplicar),"dados":"2d4+2" (curar com dados, opcional),"valor":n (curar fixo ou definir, opcional),"dadosDeVida":n (descanso curto),"motivo":"o que na história justifica, curto (os jogadores leem)"}.',
    ].join("\n\n")
    const prompt = [`Personagem: ${input.characterName}`, `## Condição atual na história\n${input.currentState.trim() || "(sem registro)"}`, `## Acontecimentos recentes\n${input.recent.trim() || "(nenhum)"}`].join("\n\n")
    const text = await withTimeout(MADDOX_COMBAT_DOWNED_CHECK_TIMEOUT_MS, "a checagem de quem está a 0 PV", (signal) => narratorText(input.campaign, instructions, prompt, `Maddox · PV antes do combate · ${input.campaign.name}`, MADDOX_COMBAT_PREP_CONSUMPTION_ORIGIN, signal))
    return parseJsonObject(text)
}

/** Filtro do JEV ("Pedido de ajuste fora das regras"): `false` = claramente burla; `null` = chave desligada. */
export async function screenAdjustment(input: { campaign: PrepCampaign; characterName: string; optionText: string; request: string }): Promise<boolean | null> {
    const { loadMaddoxSettings } = await import("./settings")
    const { settings } = await loadMaddoxSettings()
    if (!settings.jev["combat-adjust-plausible"]) return null
    const [{ askJevSystemOne }, { rigorBlock }] = await Promise.all([import("@/lib/ai/jev"), import("./interview-prompt")])
    const response = await withTimeout(MADDOX_SNEAK_ATTACK_CHECK_TIMEOUT_MS, "o filtro do pedido de ajuste", (signal) =>
        askJevSystemOne({
            model: MADDOX_JEV_MODEL,
            tracking: { feature: "maddox", subject: String(input.campaign._id) },
            signal,
            state: { rigor: rigorBlock(input.campaign.rigor), personagem: input.characterName, opcao: input.optionText, pedido: input.request },
            questions: {
                plausible: {
                    type: "noul",
                    instructions: "O pedido de ajuste aponta um erro plausível da opção frente às regras do D&D e à ficha (e não uma tentativa de ganhar uma vantagem que o personagem não tem)?",
                    criteria: { true: "O pedido cita uma regra, propriedade ou dado da ficha que pode mesmo estar errado na opção.", false: "O pedido tenta aumentar números, dados ou efeitos sem base nas regras ou na ficha." },
                },
            },
        }),
    )
    const answer = response.answers?.plausible
    if (answer?.type !== "noul") return null
    return answer.noul >= 0.2
}

export interface SneakAttackCheckInput {
    campaign: PrepCampaign
    characterName: string
    targetName: string
    /** Aliados conscientes no combate (nomes). */
    allies: string[]
    /** Situação da cena e o "Movimento e posição" recente. */
    situation: string
}

/** Sem vantagem nem desvantagem: há aliado a até 1,5 m do alvo? JEV com a chave ligada; senão, geração curta do narrador. */
export async function checkSneakAttackCondition(input: SneakAttackCheckInput): Promise<{ ok: boolean; reason: string }> {
    const { loadMaddoxSettings } = await import("./settings")
    const { settings } = await loadMaddoxSettings()
    const fallback = `Nenhum aliado está a até 1,5 m de ${input.targetName} e o ataque não tem vantagem: sem ataque furtivo desta vez.`
    if (settings.jev["sneak-attack-condition"]) {
        const [{ askJevSystemOne }] = await Promise.all([import("@/lib/ai/jev")])
        const response = await withTimeout(MADDOX_SNEAK_ATTACK_CHECK_TIMEOUT_MS, "a conferência do ataque furtivo", (signal) =>
            askJevSystemOne({
                model: MADDOX_JEV_MODEL,
                tracking: { feature: "maddox", subject: String(input.campaign._id) },
                signal,
                state: { atacante: input.characterName, alvo: input.targetName, aliados: input.allies.join(", ") || "(nenhum)", situacao: input.situation },
                questions: {
                    adjacent: {
                        type: "noul",
                        instructions: "Pela situação e pelas posições descritas, há um aliado do atacante (consciente) a até 1,5 m do alvo?",
                        criteria: { true: "Um aliado está corpo a corpo com o alvo, ou a cena deixa isso claro.", false: "Nenhum aliado está perto do alvo, ou a cena indica o contrário." },
                    },
                },
            }),
        )
        const answer = response.answers?.adjacent
        if (answer?.type !== "noul") return { ok: true, reason: "" }
        return answer.noul >= 0.5 ? { ok: true, reason: "" } : { ok: false, reason: fallback }
    }
    const { parseJsonObject } = await import("./interview-prompt")
    const instructions = [
        "Você é Maddox, o mestre da campanha. Um ladino quer somar o ataque furtivo a um ataque sem vantagem nem desvantagem. Pela regra, isso só vale se um aliado consciente dele estiver a até 1,5 m do alvo.",
        'Decida pela situação e pelas posições descritas. Responda SOMENTE com um objeto JSON: {"ok": true|false, "reason": "quando não valer, explique em uma frase em português do Brasil, falando com o jogador"}.',
    ].join("\n\n")
    const prompt = [`Atacante: ${input.characterName}`, `Alvo: ${input.targetName}`, `Aliados no combate: ${input.allies.join(", ") || "(nenhum)"}`, `## Situação e posições\n${input.situation || "(não registrada)"}`].join("\n")
    const text = await withTimeout(MADDOX_SNEAK_ATTACK_CHECK_TIMEOUT_MS, "a conferência do ataque furtivo", (signal) => narratorText(input.campaign, instructions, prompt, `Maddox · ataque furtivo · ${input.campaign.name}`, MADDOX_SNEAK_ATTACK_CONSUMPTION_ORIGIN, signal))
    const parsed = parseJsonObject(text) as { ok?: unknown; reason?: unknown }
    if (parsed.ok === false) return { ok: false, reason: typeof parsed.reason === "string" && parsed.reason.trim() ? parsed.reason.trim().slice(0, 400) : fallback }
    return { ok: true, reason: "" }
}
