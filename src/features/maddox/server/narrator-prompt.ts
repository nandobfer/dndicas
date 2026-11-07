import { memoriesSection } from "@/features/ai/memories-prompt"
import { MADDOX_CATALOG_TOOL_NAMES, MADDOX_DEFAULT_DENSITY, MADDOX_DENSITY_LEVEL_DEFS, MADDOX_CHECK_RIGORS, MADDOX_CHECK_ROUNDS_MAX, MADDOX_COMBAT_LONG_TURNS, MADDOX_COMBAT_RIGORS, MADDOX_DECLARATION_VALIDATION_RIGORS, MADDOX_PROFILE_SECTIONS, MADDOX_TACTICAL_COMBAT_RIGORS, MADDOX_TOOL_TEXT_GUIDE, MADDOX_WORLD_CATALOG_RIGORS, type MaddoxCampaignMemoryKind, type MaddoxDensityLevel, type MaddoxGameMessageKind, type MaddoxQuestStatus, type MaddoxRigorLevel, type MaddoxVisibility } from "../constants"
import { CATALOG_CITATION_RULE, rigorBlock } from "./interview-prompt"
import { checkSucceeded } from "../check-modifier"
import { worldCatalogLines, type WorldCatalog } from "../world-catalog"

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

/** Modo narrativo puro: Narrativo e Flexível não usam rolagens nem números. */
export const MADDOX_NARRATIVE_MODE_RULE = [
    "## Modo narrativo",
    "- Toda a experiência é narrativa, inclusive combate, aprendizado e progressão. Não use dados, rolagens, testes numéricos, atributos com pontuação, pontos de vida, barras de recursos nem turnos mecânicos.",
    "- Descreva capacidades, ferimentos, desgaste e recursos qualitativamente. Quantidades concretas do mundo (três flechas, dois dias de viagem) podem aparecer normalmente.",
].join("\n")

/** O grau pede testes de atributo/perícia/resistência (Maddox 5). */
export const usesChecks = (rigor: MaddoxRigorLevel) => MADDOX_CHECK_RIGORS.includes(rigor)

const CHECK_FREQUENCY: Partial<Record<MaddoxRigorLevel, string>> = {
    equilibrado: "Peça teste só nos momentos decisivos, quando o resultado é incerto e muda a história; ações do dia a dia se resolvem na narrativa.",
    rigoroso: "Peça teste sempre que for adequado pelas regras do D&D: quando o resultado for incerto e houver consequência relevante.",
    "fiel-dnd": "Peça testes exatamente como nas regras do D&D 2024: toda tentativa com resultado incerto e consequência relevante pede o teste e a CD adequados.",
}

/** Regras dos testes nos graus com ficha (substitui o modo narrativo puro). */
export function checksRule(rigor: MaddoxRigorLevel): string {
    return [
        "## Fichas e testes",
        "- Os personagens dos jogadores têm ficha D&D (resumo em cada personagem abaixo): use atributos, perícias, proficiências, PV e CA para decidir o que é possível e o quanto é difícil.",
        `- ${CHECK_FREQUENCY[rigor] ?? CHECK_FREQUENCY.rigoroso}`,
        "- Para pedir um teste, chame a ferramenta `request_check` (personagem, tipo — perícia, atributo ou resistência —, a perícia ou o atributo, a CD, vantagem ou desvantagem quando houver e um motivo curto). Um teste por personagem a cada narração; vários personagens podem testar ao mesmo tempo.",
        "- NUNCA role dados nem invente resultados: quem rola é o jogador, com os modificadores da ficha, e o resultado real chega na mensagem seguinte. Ao pedir um teste, narre até o momento da tentativa e PARE: não decida o resultado nem termine perguntando o que os jogadores fazem.",
        "- Com o resultado em mãos, compare o total com a CD (20 natural é sempre sucesso e 1 natural sempre falha, qualquer que seja a CD; ambos marcantes) e narre a consequência na ficção, sem recitar números.",
        usesTacticalCombat(rigor)
            ? "- O combate é TÁTICO (seção \"Combate tático\"): iniciativa, turnos por combatente e os dados rolados pelos jogadores e pelo servidor; você conduz os adversários pelas ferramentas e narra os resultados."
            : usesCombat(rigor)
            ? "- O combate é narrado e registrado pelas ferramentas de combate (seção \"Combate narrativo\"), sem iniciativa nem turnos mecânicos; testes podem aparecer nos golpes decisivos. Não aplique dano nem gaste recursos da ficha pelos números."
            : "- O combate continua narrado (sem iniciativa nem turnos mecânicos); testes podem aparecer nos momentos decisivos dele. Não aplique dano nem gaste recursos da ficha pelos números.",
    ].join("\n")
}

/** O grau registra o combate narrativo pelas ferramentas (Maddox 6): Narrativo, Flexível e Equilibrado. */
export const usesCombat = (rigor: MaddoxRigorLevel) => MADDOX_COMBAT_RIGORS.includes(rigor)

/** Regras do combate narrativo (cinemático, sem iniciativa), só nos graus com combate registrado. */
export function combatRule(rigor: MaddoxRigorLevel): string {
    return [
        "## Combate narrativo",
        "- Quando a hostilidade de fato começa (um ataque, uma emboscada; não uma ameaça ou uma discussão), chame `start_combat` com um título curto, o local e os adversários (e aliados, se houver). Use `registrarNpc` só para quem tem nome próprio e deve continuar na história; grupos genéricos ficam só no combate.",
        "- Narre o combate de forma cinemática e simples: sem iniciativa, sem turnos mecânicos, sem pontos de vida nem números. Resolva as declarações de todos entrelaçadas no mesmo momento da luta; cada narração muda o rumo dela (alguém cai, recua, se rende, um reforço chega, o terreno muda).",
        usesChecks(rigor) ? "- Testes só nos golpes decisivos da luta, pela regra dos testes acima." : "- Nada de dados nem testes: o resultado vem da coerência da ficção.",
        "- Use `update_combat` quando a condição de um adversário mudar ou alguém entrar na luta. `get_combat` lê o combate em andamento.",
        "- Quando a luta terminar (vitória, derrota, fuga, rendição ou trégua), chame `end_combat` na mesma narração: resultado, resumo público, o desfecho de cada adversário, as recompensas obtidas (moedas, itens ou outra coisa, com quem recebeu), a condição de cada personagem depois da luta e a cena final descrita visualmente (sem segredos). Narre o desfecho e termine num ponto de decisão.",
        "- Um personagem jogador não morre por conveniência: a derrota leva a captura, fuga, ferimentos ou outras consequências coerentes, salvo se a ficção já tornou a morte inevitável.",
    ].join("\n")
}

export interface NarratorCombat {
    title: string
    location: string
    masterTurns: number
    combatants: readonly { name: string; side: "inimigo" | "aliado"; quantity: number; condition: string; description: string }[]
}

function combatBlock(combat: NarratorCombat | null | undefined): string | null {
    if (!combat) return null
    const lines = combat.combatants.map((item) => {
        const count = item.quantity > 1 ? ` (${item.quantity})` : ""
        const side = item.side === "aliado" ? " [aliado]" : ""
        const description = item.description.trim() ? `: ${oneLine(item.description, 200)}` : ""
        return `- **${item.name}**${count}${side}${description} — condição: ${item.condition.trim() ? oneLine(item.condition, 200) : "sem registro"}`
    })
    const long = combat.masterTurns >= MADDOX_COMBAT_LONG_TURNS ? [`- A luta já dura ${combat.masterTurns} narrações: conduza-a a um desfecho (vitória, derrota, fuga, rendição ou trégua) e encerre com \`end_combat\`.`] : []
    return [`## Combate em andamento: ${combat.title}`, ...(combat.location.trim() ? [`- Local: ${combat.location.trim()}`] : []), `- Narrações desde o início: ${combat.masterTurns}`, ...lines, ...long].join("\n")
}

/** O grau usa o combate tático (Maddox 7): Rigoroso e Fiel ao D&D. */
export const usesTacticalCombat = (rigor: MaddoxRigorLevel) => MADDOX_TACTICAL_COMBAT_RIGORS.includes(rigor)

/** Regras do combate tático (iniciativa e turnos), só nos graus Rigoroso e Fiel ao D&D. */
export function tacticalCombatRule(rigor: MaddoxRigorLevel): string {
    return [
        "## Combate tático",
        "- Quando a hostilidade de fato começa, chame `start_combat` com o bloco de estatísticas de cada adversário: `monstro` do catálogo de Monstros (confirme com `search_catalog`, tipo Monstro)" +
            (rigor === "fiel-dnd" ? " — no Fiel ao D&D, SÓ monstros do catálogo." : " ou, no Rigoroso, `estatisticas` próprias quando não houver um monstro adequado.") +
            " Indique `surpresa` quando um lado for pego desprevenido. Narre o começo da luta e PARE: os jogadores rolam a iniciativa.",
        "- A ordem de iniciativa é do servidor. Na vez de um personagem, o JOGADOR age pelos botões (Ação, Ação bônus, reações) e rola os próprios dados; o resultado chega pronto na tarefa. Você narra o que aconteceu com base nesses números, sem mudá-los.",
        "- Os adversários agem UM DE CADA VEZ, cada um numa narração própria (o bloco dele, indicado na tarefa). No bloco, chame primeiro `monster_action` para ele (ataque, salvaguarda ou outra ação do bloco de estatísticas; Ataques Múltiplos = uma chamada por ataque) e só depois narre. O SERVIDOR rola e aplica, e a mesa vê os dados rolando antes do seu texto: nunca invente acertos, dano ou PV. Use os números do retorno na narração com moderação (o golpe, o ferimento), sem virar planilha.",
        "- Quando o retorno disser que alguém pode reagir ou precisa rolar (salvaguarda, reação, concentração), narre até aquele instante e PARE; a continuação chega com o resultado e você conclui o mesmo adversário.",
        "- Quando um adversário sair do alcance de um personagem, ou conjurar uma magia diante de quem tem Contramágica, chame `offer_reaction`. Efeitos que você adjudica (ambiente, magia utilitária, ação livre aceita) usam `apply_effect` (condição, dano ou cura em dados rolados pelo servidor); dano de uma ação livre de personagem usa `request_damage_roll`.",
        "- \"Outra ação\" de um jogador já foi validada pelo rigor; resolva-a pelas regras (peça teste com `request_check` quando couber).",
        "- Personagem com 0 PV fica Inconsciente e faz testes contra a morte na vez dele; ninguém morre por conveniência da história, só pelas regras.",
        "- Quando todos os inimigos caírem, fugirem ou se renderem (ou o grupo cair), chame `end_combat` na mesma narração: resultado, resumo, desfecho de cada adversário, recompensas e a cena final.",
    ].join("\n")
}

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
    "- Markdown em parágrafos de prosa, no tamanho pedido na tarefa. Use **negrito** para nomes próprios do mundo (personagens, lugares, facções, NPCs) e para ênfase, e citação (`>`) para falas e trechos marcantes quando ajudar.",
    CATALOG_CITATION_RULE,
    "- Não use títulos de turno, tabelas nem listas de regras; a narração é uma cena.",
].join("\n")

export const MADDOX_PERSISTENCE_RULE = [
    "## Continuidade e anotações da campanha",
    "- O estado gravado abaixo é a versão oficial da história. Consulte os detalhes pelas ferramentas quando a cena depender deles (NPC, local, missão, memória) em vez de inventar.",
    "- Antes de concluir, grave o que mudou: `update_campaign_state` quando a cena, o local, a situação ou a decisão aguardada mudar; `save_npc` para NPCs novos ou que mudaram; `save_memory` para locais (`local`), missões (`missao`, com `status`), marcos da história (`evento`), relações (`relacao`) e fatos duráveis (`fato`); `update_character_state` quando ferimentos, recursos ou a situação de um personagem mudar.",
    "- Grave só o que é novo ou mudou, sem duplicar nem gravar a cada golpe ou fala. Separe o que os jogadores sabem (`players`) do que é segredo do mestre (`master`).",
    "- Os jogadores consultam no Diário da campanha o estado da história (`update_campaign_state`), a condição dos personagens (`update_character_state`), a descrição pública dos NPCs e as anotações `players`. Nunca ponha segredos nesses campos: o que só o mestre sabe vai em `masterNotes` do `save_npc` ou em `save_memory` com `visibility: master`.",
    `- Cada anotação é um texto consolidado e conciso, de até uns ${MADDOX_TOOL_TEXT_GUIDE.toLocaleString("pt-BR")} caracteres: ao atualizar, reescreva o essencial em vez de acumular. Se o retorno trouxer \`truncated\`, consolide e grave de novo.`,
    "- Grave antes ou depois de escrever a narração, nunca no meio dela, e não comente as gravações no texto.",
].join("\n")

/** Consulta ao catálogo do DnDicas na narração (todos os graus). */
export function narratorCatalogRule(rigor: MaddoxRigorLevel, world: WorldCatalog | null = null): string {
    const faithful = MADDOX_WORLD_CATALOG_RIGORS.includes(rigor)
    return [
        "## Catálogo do DnDicas",
        `- Para regras, magias, itens, monstros e capacidades de classe, subclasse, raça ou origem, consulte \`${MADDOX_CATALOG_TOOL_NAMES.search}\` e \`${MADDOX_CATALOG_TOOL_NAMES.get}\` antes de afirmar a mecânica. Cite com {{Tipo:Nome}} só o que a busca devolveu, com o nome exato dela.`,
        usesChecks(rigor)
            ? "- Use o que o catálogo diz para decidir o que é possível e a dificuldade dos testes; não invente regras nem entidades que a busca não confirmou."
            : "- A consulta serve de referência: a narrativa tem prioridade e nada vira número na história.",
        ...(faithful
            ? [
                  "- Fiel ao D&D: as entidades de regras do catálogo são a fonte de verdade. NPCs só dos povos (raças) e classes deste mundo; magias, itens, criaturas e recompensas só do catálogo, confirmados com a busca antes de entrarem na história. Nunca invente povos, classes, magias ou itens. Onde não houver regra clara, você decide pelo seu julgamento.",
                  ...worldCatalogLines(world ?? { races: [], classes: [] }),
              ]
            : []),
        "- Consulte só quando a cena depender disso (poucas buscas por narração).",
    ].join("\n")
}

export interface NarratorCharacter {
    name: string
    playerName: string
    profile: Record<string, string>
    currentState: string
    /** Resumo da ficha D&D (graus com testes). */
    sheet?: string | null
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
    agentMemories: string
    rigor: MaddoxRigorLevel
    campaignName: string
    setting: string
    openingSituation: string
    /** Povos e classes do mundo (Maddox 8, Fiel ao D&D); vazio = todo o catálogo. */
    worldCatalog?: WorldCatalog | null
    state: { scene: string; location: string; situation: string; pendingDecision: string }
    characters: readonly NarratorCharacter[]
    npcs: readonly NarratorNpc[]
    memories: readonly NarratorMemory[]
    /** Combate em andamento (Maddox 6; só nos graus com combate narrativo). */
    combat?: NarratorCombat | null
    /** Combate tático em andamento (Maddox 7): bloco já montado (ordem, PV, CA, condições, quem age). */
    tacticalCombat?: string | null
    /** Imagens nas cenas (Maddox 10): situações que o narrador pode pedir e a cota agora. `null` = desligadas. */
    sceneImages?: NarratorSceneImages | null
}

export interface NarratorSceneImages {
    /** Situações ativas pedidas pela ferramenta (sem fim de batalha e retrato). */
    situations: readonly { key: string; label: string; description: string }[]
    /** Situação "Retrato de NPC" ativa (`save_npc { gerarRetrato }`). */
    portraits: boolean
    /** Motivo pelo qual não cabe imagem automática agora (intervalo, teto do dia). */
    blocked: string | null
}

/** Regra "## Imagens da cena" (Maddox 10): só com alguma situação pedida pelo narrador ativa. */
export function sceneImagesRule(images: NarratorSceneImages | null | undefined): string | null {
    if (!images || (!images.situations.length && !images.portraits)) return null
    const lines = ["## Imagens da cena"]
    if (images.situations.length) {
        lines.push(
            "Você pode pedir UMA ilustração por narração com request_scene_image, só quando a narração for de fato uma destas situações (use a chave entre crases):",
            ...images.situations.map((item) => `- \`${item.key}\` — ${item.label}: ${item.description}`),
            "- Descreva só o que os jogadores veem (lugar, luz, clima, quem aparece e a ação), sem segredos do mestre; informe os personagens, os NPCs conhecidos e as entidades do catálogo que aparecem, para a aparência deles ser respeitada.",
            "- Não mencione a imagem no texto da narração. Fim de batalha gera imagem sozinho pela cenaFinal do end_combat.",
        )
        if (images.blocked) lines.push(`- AGORA: ${images.blocked} Não peça imagem nesta narração.`)
    }
    if (images.portraits) lines.push("- Retrato de NPC: ao apresentar aos jogadores um NPC importante para a história, salve-o com save_npc { gerarRetrato: true } (uma vez por NPC).")
    return lines.join("\n")
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
    const sheet = character.sheet?.trim() ? [`- Ficha D&D:`, ...character.sheet.trim().split("\n").map((line) => `  - ${line}`)] : []
    return [`### ${character.name} (jogador: ${character.playerName})`, ...sections, `- Condição atual na história: ${character.currentState.trim() ? oneLine(character.currentState, 1_200) : "(sem mudanças registradas)"}`, ...sheet].join("\n")
}

/**
 * Lembrete de cada turno (Maddox 9): o estado e a condição dos personagens aparecem no Diário da campanha. Fica junto do
 * próprio estado, além da regra de persistência, para o modelo não tratá-los como rascunho do mestre.
 */
export const MADDOX_PUBLIC_STATE_NOTE =
    "_Os jogadores leem este estado e a condição de cada personagem no Diário da campanha: ao gravar com `update_campaign_state` ou `update_character_state`, escreva só o que os personagens sabem; segredo vai em `masterNotes` (`save_npc`) ou em `save_memory` com `visibility: master`._"

function stateBlock(state: NarratorPromptContext["state"]): string {
    const lines = [
        ["Cena", state.scene],
        ["Local", state.location],
        ["Situação", state.situation],
        ["Decisão aguardada", state.pendingDecision],
    ]
        .filter(([, value]) => value?.trim())
        .map(([label, value]) => `- ${label}: ${value!.trim()}`)
    return ["## Estado atual da história", MADDOX_PUBLIC_STATE_NOTE, lines.length ? lines.join("\n") : "- (ainda não registrado: a história está começando)"].join("\n")
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

export type NarratorToolMode = { kind: "ai-sdk" } | { kind: "mcp"; server: string; turnToken: string; checks?: boolean; combat?: boolean; tactical?: boolean; sceneImages?: boolean }

/** Bloco das ferramentas: na AI SDK elas vêm na chamada; no OpenCode, pelo MCP com o token de turno. */
function toolsBlock(mode: NarratorToolMode): string | null {
    if (mode.kind === "ai-sdk") return null
    return [
        "## Ferramentas desta narração",
        `- As ferramentas de anotações da campanha estão no servidor MCP \`${mode.server}\` (get_campaign_state, update_campaign_state, list_npcs, get_npc, save_npc, search_memories, save_memory, update_character_state, resolve_reminder${mode.checks ? ", request_check" : ""}${mode.combat ? ", get_combat, start_combat, update_combat, end_combat" : ""}${mode.tactical ? ", monster_action, apply_effect, request_damage_roll, offer_reaction" : ""}${mode.sceneImages ? ", request_scene_image" : ""}, ${MADDOX_CATALOG_TOOL_NAMES.search}, ${MADDOX_CATALOG_TOOL_NAMES.get}).`,
        `- Em TODA chamada a essas ferramentas, envie o campo \`turno\` exatamente com este valor: \`${mode.turnToken}\`.`,
        "- Não use outras ferramentas (arquivos, terminal, web): a campanha vive só nessas anotações.",
    ].join("\n")
}

export function buildNarratorInstructions(context: NarratorPromptContext, mode: NarratorToolMode): string {
    const parts: string[] = [context.instructions.trim()]
    const memories = memoriesSection(context.agentMemories).trim()
    if (memories) parts.push(memories)
    parts.push(MADDOX_NARRATOR_RULES, usesChecks(context.rigor) ? checksRule(context.rigor) : MADDOX_NARRATIVE_MODE_RULE, rigorBlock(context.rigor))
    if (usesCombat(context.rigor)) parts.push(combatRule(context.rigor))
    if (usesTacticalCombat(context.rigor)) parts.push(tacticalCombatRule(context.rigor))
    if (judgesFreeActionsInNarration(context.rigor)) parts.push(MADDOX_FREE_ACTION_RULE)
    parts.push(MADDOX_NARRATOR_FORMAT, MADDOX_PERSISTENCE_RULE, narratorCatalogRule(context.rigor, context.worldCatalog ?? null))
    const images = sceneImagesRule(context.sceneImages)
    if (images) parts.push(images)
    const tools = toolsBlock(mode)
    if (tools) parts.push(tools)
    parts.push(`# Campanha "${context.campaignName}"`)
    parts.push(`## Cenário\n${context.setting.trim() || "(sem cenário registrado)"}`)
    if (context.openingSituation.trim()) parts.push(`## Situação inicial combinada\n${context.openingSituation.trim()}`)
    parts.push(["## Personagens dos jogadores", ...(context.characters.length ? context.characters.map(characterBlock) : ["(nenhum)"])].join("\n\n"))
    parts.push(stateBlock(context.state))
    const combat = usesCombat(context.rigor) ? combatBlock(context.combat) : null
    if (combat) parts.push(combat)
    if (usesTacticalCombat(context.rigor) && context.tacticalCombat) parts.push(context.tacticalCombat)
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
    /** JEV "Pedir teste": a ação provavelmente exige teste (orientação; o Maddox decide). */
    checkHint?: boolean
}

/** Resultado de um teste pedido pelo Maddox (Maddox 5), para a continuação e a transcrição. */
export interface NarratorCheckResult {
    characterName: string
    /** "Furtividade (Destreza)". */
    title: string
    reason: string
    dc: number
    status: "pending" | "rolled" | "cancelled"
    mode: "normal" | "advantage" | "disadvantage"
    total: number | null
    d20: number | null
    discarded: number | null
    modifier: number | null
    rolledByOwner: boolean
    cancelReason: string | null
}

/** Combate tático (Maddox 7): quem age nesta narração e o que fechar. */
export interface NarratorTacticalTask {
    phase: "initiative" | "running"
    /** Adversários que agem agora, em ordem. */
    queue: readonly string[]
    /** O personagem da vez seguinte. */
    next: string | null
    enemiesDown: boolean
    charactersDown: boolean
    /**
     * Bloco desta geração (DND-25): a narração do que já aconteceu (`character`, nenhum adversário age) ou a vez de UM
     * adversário (`npc`). `resumed` = continuação do mesmo bloco depois de uma espera; `remaining` = os que vêm depois.
     */
    block?: { kind: "character" | "npc"; actor: string | null; resumed: boolean; waits: number; remaining: readonly string[] } | null
}

export type NarratorTask =
    | { kind: "narration"; turnNumber: number; declarations: readonly NarratorDeclaration[]; combatHint?: "start" | "end" | null; tactical?: NarratorTacticalTask | null }
    | { kind: "continuation"; turnNumber: number; round: number; declarations: readonly NarratorDeclaration[]; results: readonly NarratorCheckResult[]; combatResults?: readonly string[]; tactical?: NarratorTacticalTask | null; lastRound?: boolean }
    | { kind: "answer"; turnNumber: number; characterName: string; question: string; declarations: readonly NarratorDeclaration[] }

const declarationLines = (declarations: readonly NarratorDeclaration[]) =>
    declarations.map((item) =>
        item.kind === "pass"
            ? `- **${item.characterName}**: não fez nada${item.skipped ? " (o dono pulou a vez do jogador)" : ""}.`
            : `- **${item.characterName}**: ${item.content.trim()}${item.checkHint ? " _(o JEV indica que esta ação provavelmente exige teste; você decide)_" : ""}`,
    )

const signedNumber = (value: number) => (value >= 0 ? `+${value}` : String(value))

/** "Lyra — Furtividade (Destreza), CD 15: total 17 (d20 12, modificador +5; vantagem: 12 e 7)". */
export function checkResultLine(result: NarratorCheckResult): string {
    const head = `${result.characterName} — ${result.title}, CD ${result.dc}`
    if (result.status === "cancelled") return `${head}: cancelado (${result.cancelReason ?? "o jogador saiu da campanha"}); resolva sem o teste.`
    if (result.status === "pending" || result.total === null) return `${head}: aguardando a rolagem.`
    const mode = result.mode !== "normal" && result.discarded !== null ? `; ${result.mode === "advantage" ? "vantagem" : "desvantagem"}: ${result.d20} e ${result.discarded}` : ""
    const natural = result.d20 === 20 ? "; 20 natural" : result.d20 === 1 ? "; 1 natural" : ""
    const owner = result.rolledByOwner ? "; rolado pelo dono no lugar do jogador" : ""
    return `${head}: total ${result.total} (d20 ${result.d20}, modificador ${signedNumber(result.modifier ?? 0)}${mode}${natural}${owner}) — ${checkSucceeded(result.total, result.dc, result.d20) ? "sucesso" : "falha"}.`
}

/** O que a vez dos adversários pede nesta narração (combate tático). */
export function tacticalTaskLines(tactical: NarratorTacticalTask | null | undefined): string[] {
    if (!tactical) return []
    if (tactical.phase === "initiative") return ["", "Combate tático: os jogadores ainda rolam a iniciativa. Não conduza ataques; narre o instante antes da luta e pare."]
    if (tactical.enemiesDown) return ["", "Combate tático: TODOS os inimigos estão fora de combate. Narre o desfecho e chame `end_combat` nesta narração."]
    if (tactical.charactersDown) return ["", "Combate tático: nenhum personagem está de pé. Narre o desfecho e chame `end_combat` nesta narração (derrota, captura ou o que fizer sentido)."]
    const block = tactical.block
    if (block?.kind === "npc" && block.actor) {
        return [
            "",
            `Combate tático — bloco de **${block.actor}**: SÓ ele age agora.${block.resumed ? " Conclua a narração dele com o resultado acima, sem repetir o que já foi narrado." : ""}`,
            block.resumed
                ? `Se ainda faltar algum ataque dos Ataques Múltiplos de ${block.actor}, chame \`monster_action\` antes de narrar.`
                : `Primeiro chame \`monster_action\` (Ataques Múltiplos = uma chamada por ataque, em sequência) ou \`apply_effect\`, ANTES de escrever; só depois narre, em um ou dois parágrafos, o que ${block.actor} fez e o resultado. Se ele não atacar (move-se, foge, usa Disparada), apenas narre, sem ferramentas.`,
            "Não narre outros adversários nem decida o que os personagens fazem.",
            block.remaining.length
                ? `Depois dele, cada um no próprio bloco: ${block.remaining.join(", ")}. Termine no fim da ação de ${block.actor}.`
                : tactical.next
                  ? `Depois dele é a vez de **${tactical.next}**: termine passando a vez a esse personagem (sem decidir o que ele faz).`
                  : "",
        ].filter(Boolean)
    }
    if (block?.kind === "character") {
        return [
            "",
            "Combate tático — nesta narração NENHUM adversário age: narre só o que já aconteceu (a vez que fechou ou o começo da luta) e não chame `monster_action`.",
            tactical.queue.length
                ? `Depois, cada adversário age no próprio bloco, nesta ordem: ${tactical.queue.join(", ")}. Termine no instante antes de eles agirem.`
                : tactical.next
                  ? `Depois é a vez de **${tactical.next}**: termine passando a vez a esse personagem (sem decidir o que ele faz).`
                  : "",
        ].filter(Boolean)
    }
    return [
        "",
        tactical.queue.length
            ? `Combate tático — agem agora, nesta ordem: ${tactical.queue.join(", ")}. Conduza cada um com \`monster_action\` (veja get_combat para as ações e os alvos) e narre os resultados.`
            : "Combate tático — nenhum adversário age antes da próxima vez.",
        tactical.next ? `Depois deles é a vez de **${tactical.next}**: termine a narração passando a vez a esse personagem (sem decidir o que ele faz).` : "",
    ].filter(Boolean)
}

/**
 * Linha de tamanho das narrações (DND-22), pela densidade da campanha. Vai no texto da tarefa (não nas instruções) para
 * valer só nas narrações, nunca nas respostas às perguntas, e para a mudança valer já na próxima narração mesmo com a
 * sessão do OpenCode reaproveitada.
 */
export function narrationDensityLine(density: MaddoxDensityLevel): string {
    const def = MADDOX_DENSITY_LEVEL_DEFS[density] ?? MADDOX_DENSITY_LEVEL_DEFS[MADDOX_DEFAULT_DENSITY]
    return `Tamanho desta narração (densidade **${def.label}**): ${def.size}. Ajuste o nível de detalhe a esse tamanho, sem deixar de narrar a consequência de cada declaração e sem cortar a cena no meio.`
}

/** Texto da tarefa da geração; com `density`, as narrações (não as respostas) recebem a linha de tamanho. */
export function narratorTaskText(task: NarratorTask, options: { density?: MaddoxDensityLevel | null } = {}): string {
    const text = taskBody(task)
    return options.density && task.kind !== "answer" ? `${text}\n\n${narrationDensityLine(options.density)}` : text
}

function taskBody(task: NarratorTask): string {
    const tactical = task.kind !== "answer" ? task.tactical : null
    const block = tactical?.block
    if (block?.kind === "npc" && !block.resumed && !tactical?.enemiesDown && !tactical?.charactersDown) {
        return [`# Turno ${task.turnNumber} do mestre — vez de ${block.actor}`, ...tacticalTaskLines(tactical), "", "Depois grave o que mudou."].join("\n")
    }
    if (task.kind === "continuation") {
        const last = task.lastRound ?? task.round >= MADDOX_CHECK_ROUNDS_MAX - 1
        return [
            `# Turno ${task.turnNumber} do mestre — resultado ${task.combatResults?.length && !task.results.length ? "das rolagens" : "dos testes"}`,
            ...(task.declarations.length ? ["Declarações do turno dos jogadores que está sendo resolvido:", ...declarationLines(task.declarations), ""] : []),
            ...(task.results.length ? ["Resultado dos testes que você pediu (rolagens reais dos jogadores):", ...task.results.map((result) => `- ${checkResultLine(result)}`)] : []),
            ...(task.combatResults?.length ? ["Resultado das rolagens e reações do combate (já aplicados pelo servidor):", ...task.combatResults.map((line) => `- ${line}`)] : []),
            ...tacticalTaskLines(task.tactical),
            "",
            "Continue a narração exatamente de onde parou: narre a consequência de cada teste na ficção, sem recitar números e sem repetir o que já foi narrado, e as reações do mundo.",
            last
                ? "Este é o último pedido de testes deste turno: resolva o que faltar sem novos testes, termine no próximo ponto de decisão e grave o que mudou."
                : "Se a situação pedir um novo teste, peça-o e pare de novo; senão, termine no próximo ponto de decisão. Depois grave o que mudou.",
        ].join("\n")
    }
    if (task.kind === "answer") {
        return [
            `# Pergunta ao mestre (turno ${task.turnNumber}, turno dos jogadores)`,
            `**${task.characterName}** pergunta: ${task.question.trim()}`,
            ...(task.declarations.length ? ["", "Declarações já feitas neste turno (ainda não resolvidas):", ...declarationLines(task.declarations)] : []),
            "",
            "Responda diretamente, em poucas frases, só com o que o personagem pode perceber, lembrar ou saber. NÃO avance a cena, não resolva declarações e não atribua ações a ninguém: o turno continua aberto. Se a resposta estabelecer um fato novo do mundo, grave-o.",
        ].join("\n")
    }
    if (task.declarations.length === 0 && task.tactical?.phase === "running") {
        return [`# Turno ${task.turnNumber} do mestre — vez dos adversários`, ...tacticalTaskLines(task.tactical), "", "Depois grave o que mudou."].join("\n")
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
        ...(task.combatHint === "start" ? ["_(o JEV indica que estas ações provavelmente começam um combate; você decide e, se começar, chame `start_combat`)_"] : []),
        ...(task.combatHint === "end" ? ["_(o JEV indica que estas ações provavelmente encerram o combate; você decide e, se terminar, chame `end_combat`)_"] : []),
        ...tacticalTaskLines(task.tactical),
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
                    : message.kind === "check"
                      ? `[Turno ${message.turnNumber} — teste] ${content}`
                      : message.kind === "combat"
                        ? `[Turno ${message.turnNumber} — ${content}]`
                      : message.kind === "combat-action" || message.kind === "combat-roll" || message.kind === "combat-reaction"
                        ? `[Turno ${message.turnNumber} — combate] ${content}`
                      : message.kind === "pass"
                        ? `[Turno ${message.turnNumber} — ${who} não fez nada]`
                        : `[Turno ${message.turnNumber} — ${who} declara] ${content}`
        if (size + line.length > maxChars && lines.length > 0) break
        lines.unshift(line)
        size += line.length + 2
    }
    return lines.join("\n\n")
}
