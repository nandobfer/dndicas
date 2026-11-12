/** Constantes do Agente Maddox e das Campanhas Maddox (módulo PURO: tela e servidor). */

/** Aba do Agente Maddox em `/integracoes/ia` (`?aba=agente-maddox`). */
export const MADDOX_AI_TAB = "agente-maddox"

/** Uso "Agente Maddox" em `ai_feature_settings`. */
export const MADDOX_FEATURE = "maddox"

export const MADDOX_AUDIT_ENTITY = "AgenteMaddox"
export const MADDOX_SCRIPT_AUDIT_ENTITY = "RoteiroMaddox"
export const MADDOX_SESSION_AUDIT_ENTITY = "SessaoOpencodeMaddox"

// ── Rigor das campanhas ───────────────────────────────────────────────────────

/**
 * Grau de rigor da campanha (slider da criação, no Maddox 1): o primeiro passo é o jogo puramente
 * narrativo (sem dados nem números, como o `~/code/roleplay`); o último é estritamente fiel às regras
 * do D&D, com o catálogo do DnDicas como fonte de verdade.
 */
export const MADDOX_RIGOR_LEVELS = ["narrativo", "flexivel", "equilibrado", "rigoroso", "fiel-dnd"] as const
export type MaddoxRigorLevel = (typeof MADDOX_RIGOR_LEVELS)[number]

export type MaddoxRarity = "common" | "uncommon" | "rare" | "veryRare" | "legendary"

/**
 * Definição de cada passo do slider de rigor. Como o card de criticidade do agente adversário (opex),
 * o nível mostra duas colunas: o que segue as regras do D&D (`rules`) e o que fica livre, só na
 * narrativa (`free`). A cor é a da raridade do nível (`rarityColors`).
 */
export const MADDOX_RIGOR_LEVEL_DEFS: Record<MaddoxRigorLevel, { label: string; description: string; rarity: MaddoxRarity; rules: string[]; free: string[] }> = {
    narrativo: {
        label: "Narrativo",
        description: "Puramente interpretativo: sem rolagens, sem números, só história.",
        rarity: "common",
        rules: [],
        free: ["Ações, falas e intenções decididas pela história", "Combates narrados e cinemáticos", "Qualquer universo: anime, filme, livro, série", "Personagem descrito só em texto, sem ficha"],
    },
    flexivel: {
        label: "Flexível",
        description: "Narrativo, com regras do D&D só como inspiração.",
        rarity: "uncommon",
        rules: ["Conceitos do D&D (classes, magias, criaturas) como referência"],
        free: ["Nenhuma rolagem de dados", "Combates narrados e cinemáticos", "Qualquer universo e estilo de personagem", "O mestre decide os resultados pela coerência da história"],
    },
    equilibrado: {
        label: "Equilibrado",
        description: "Testes nos momentos importantes; o mestre decide o resto.",
        rarity: "rare",
        rules: ["Testes de atributo e perícia nos momentos decisivos", "Ficha com atributos para os testes"],
        free: ["Ações do dia a dia resolvidas na narrativa", "Combates narrados, com testes só nos golpes decisivos", "Universo livre, inspirado no D&D"],
    },
    rigoroso: {
        label: "Rigoroso",
        description: "Regras do D&D na maior parte das situações, com ficha e rolagens.",
        rarity: "veryRare",
        rules: ["Ficha completa do D&D", "Testes de atributo e perícia sempre que adequado", "Combate com iniciativa e turnos", "Magias, itens e habilidades do catálogo do DnDicas"],
        free: ["Lacunas das regras decididas pelo mestre", "Ambientação própria, com raças e classes do D&D"],
    },
    "fiel-dnd": {
        label: "Fiel ao D&D",
        description: "Estritamente de acordo com as regras e o catálogo do DnDicas.",
        rarity: "legendary",
        rules: ["Ficha completa do D&D", "Testes, iniciativa, ação e ação bônus exatamente como nas regras", "Mundo de fantasia D&D, oficial ou próprio, com povos e classes do catálogo do DnDicas", "Só magias e itens cadastrados no DnDicas", "Ação livre só vale se as regras permitirem"],
        free: ["Somente o que as regras não cobrem, decidido pelo mestre"],
    },
}

// ── Densidade das narrações ──────────────────────────────────────────────────

/**
 * Densidade das narrações da campanha (DND-22): quanto texto o narrador escreve a cada narração do turno do mestre
 * (abertura, narração, continuações e vez dos adversários). Não vale para as respostas às perguntas nem para as
 * entrevistas. É orientação ao modelo, sem corte por tokens (cortar truncaria a narração e as ferramentas).
 */
export const MADDOX_DENSITY_LEVELS = ["concisa", "breve", "equilibrada", "detalhada", "extensa"] as const
export type MaddoxDensityLevel = (typeof MADDOX_DENSITY_LEVELS)[number]
export const MADDOX_DEFAULT_DENSITY: MaddoxDensityLevel = "equilibrada"

/** Passo do slider de densidade: `size` vai na tela e no pedido ao narrador; `focus` resume o que muda. */
export const MADDOX_DENSITY_LEVEL_DEFS: Record<MaddoxDensityLevel, { label: string; description: string; rarity: MaddoxRarity; size: string; focus: string[] }> = {
    concisa: {
        label: "Concisa",
        description: "Direto ao ponto: só o essencial de cada cena.",
        rarity: "common",
        size: "1 parágrafo, até umas 60 palavras",
        focus: ["Só a consequência das ações e a próxima decisão", "Sem descrições de ambiente além do necessário"],
    },
    breve: {
        label: "Breve",
        description: "Narrações curtas, com um toque de ambientação.",
        rarity: "uncommon",
        size: "1 a 2 parágrafos, umas 60 a 120 palavras",
        focus: ["Consequências e reações do mundo em poucas frases", "Um detalhe marcante da cena"],
    },
    equilibrada: {
        label: "Equilibrada",
        description: "Ação e ambientação na medida.",
        rarity: "rare",
        size: "2 a 3 parágrafos, umas 120 a 220 palavras",
        focus: ["Consequências, reações e falas dos NPCs", "Ambientação que situa a cena"],
    },
    detalhada: {
        label: "Detalhada",
        description: "Cenas ricas, com mais ambiente, falas e sensações.",
        rarity: "veryRare",
        size: "3 a 5 parágrafos, umas 220 a 380 palavras",
        focus: ["Descrição sensorial do lugar e das pessoas", "Mais falas e reações dos NPCs"],
    },
    extensa: {
        label: "Extensa",
        description: "Narração longa, como um capítulo de livro.",
        rarity: "legendary",
        size: "4 a 7 parágrafos, umas 380 a 600 palavras",
        focus: ["Cenas desenvolvidas com calma, como prosa literária", "Detalhes do mundo, diálogos e bastidores visíveis"],
    },
}

// ── Dificuldade dos combates ─────────────────────────────────────────────────

/**
 * Dificuldade dos combates da campanha (DND-42): o balanceamento dos adversários contra o grupo nos combates táticos
 * (só Rigoroso e Fiel ao D&D, `MADDOX_TACTICAL_COMBAT_RIGORS`). Não muda o rigor das regras: orienta o narrador na
 * quantidade, na força e nas condições dos adversários ao montar `start_combat`/`update_combat`. Não é validador.
 */
export const MADDOX_COMBAT_DIFFICULTY_LEVELS = ["muito-facil", "facil", "equilibrado", "dificil", "mortal"] as const
export type MaddoxCombatDifficultyLevel = (typeof MADDOX_COMBAT_DIFFICULTY_LEVELS)[number]
export const MADDOX_COMBAT_DIFFICULTY_DEFAULT: MaddoxCombatDifficultyLevel = "equilibrado"

/**
 * Passo do slider de dificuldade, no formato do card de rigor: `rules` (o que muda nos encontros) e `free` (o que fica
 * com o Maddox); `encounter` vai no pedido ao narrador. A cor é a da raridade do nível (`rarityColors`).
 */
export const MADDOX_COMBAT_DIFFICULTY_LEVEL_DEFS: Record<MaddoxCombatDifficultyLevel, { label: string; description: string; rarity: MaddoxRarity; rules: string[]; free: string[]; encounter: string }> = {
    "muito-facil": {
        label: "Muito fácil",
        description: "Todo combate é tranquilo para o grupo: menos adversários e mais fracos.",
        rarity: "common",
        rules: ["Bem menos adversários do que personagens (2 goblins para 4 personagens de nível 1)", "Monstros de nível de desafio baixo para o grupo", "Nunca uma ameaça real de morte"],
        free: ["Que monstros aparecem, dentro do clima da cena", "Adversários que fogem ou se rendem cedo"],
        encounter:
            "todo encontro é bem favorável ao grupo: BEM menos adversários do que personagens e mais fracos que eles (ex.: 2 goblins contra 4 personagens de nível 1), nunca uma ameaça real de morte. Quando a cena justificar, eles ainda podem chegar enfraquecidos (bêbados, sonolentos, feridos), com desvantagem nos ataques.",
    },
    facil: {
        label: "Fácil",
        description: "Os combates são favoráveis ao grupo: menos adversários ou adversários em desvantagem.",
        rarity: "uncommon",
        rules: ["Menos adversários do que personagens (no máximo 3 goblins para 4 personagens de nível 1)", "Ou a quantidade cheia, enfraquecida pela cena (bêbados, sonolentos, feridos), com desvantagem nos ataques", "Nunca uma ameaça mortal"],
        free: ["Quando a cena justifica adversários enfraquecidos", "Que monstros aparecem, dentro do clima da cena"],
        encounter:
            "todo encontro é favorável ao grupo: MENOS adversários do que personagens (ex.: no máximo 3 goblins contra 4 personagens de nível 1) OU a quantidade equilibrada enfraquecida pela cena (ex.: 4 goblins bêbados ou sonolentos, com desvantagem nos ataques). Nunca uma ameaça mortal.",
    },
    equilibrado: {
        label: "Equilibrado",
        description: "Combates equilibrados pelas regras do D&D: desafio justo para o grupo.",
        rarity: "rare",
        rules: ["Adversários na medida do grupo (4 goblins para 4 personagens de nível 1)", "Encontro médio pelo orçamento de XP do Guia do Mestre"],
        free: ["Que monstros aparecem, dentro do clima da cena", "Terreno, emboscadas e surpresa pela ficção"],
        encounter: "encontro equilibrado pelo orçamento de XP do Guia do Mestre (encontro médio): adversários na medida do grupo (ex.: 4 goblins contra 4 personagens de nível 1).",
    },
    dificil: {
        label: "Difícil",
        description: "Combates exigentes: o grupo precisa de tática e recursos para vencer.",
        rarity: "veryRare",
        rules: ["Encontro difícil, no limite do orçamento de XP do grupo", "Mais adversários ou monstros mais fortes que o grupo", "Personagens podem cair; morte só pelas regras"],
        free: ["Que monstros aparecem, dentro do clima da cena", "Táticas dos adversários pela ficção"],
        encounter: "encontro difícil, no limite do orçamento de XP do grupo: mais adversários do que personagens ou monstros mais fortes (ex.: 6 goblins, ou 4 goblins com um líder, contra 4 personagens de nível 1). O grupo precisa de tática e recursos para vencer.",
    },
    mortal: {
        label: "Mortal",
        description: "Combates mortais: acima do que o grupo aguenta, com risco real de morte.",
        rarity: "legendary",
        rules: ["Encontro mortal, acima do orçamento de XP do grupo", "Adversários em maior número e mais fortes", "Risco real de morte dos personagens"],
        free: ["Que monstros aparecem, dentro do clima da cena", "Rotas de fuga ou trégua, se a ficção permitir"],
        encounter: "encontro mortal, acima do orçamento de XP do grupo: adversários em maior número e mais fortes que os personagens, com risco real de morte (ex.: 8 goblins com um líder, ou um ogro, contra 4 personagens de nível 1).",
    },
}

/** Permissão Perfix das Campanhas Maddox (criar, participar, convidar). */
export const MADDOX_PLAY_PERMISSION = "maddox.play"

// ── Campanhas ─────────────────────────────────────────────────────────────────

export const MADDOX_CAMPAIGN_STATUSES = ["lobby", "interview", "active", "paused", "ended", "archived"] as const
export type MaddoxCampaignStatus = (typeof MADDOX_CAMPAIGN_STATUSES)[number]

export const MADDOX_CAMPAIGN_STATUS_DEFS: Record<MaddoxCampaignStatus, { label: string; rarity: MaddoxRarity | "artifact" }> = {
    lobby: { label: "No lobby", rarity: "uncommon" },
    interview: { label: "Em entrevista", rarity: "rare" },
    active: { label: "Em andamento", rarity: "veryRare" },
    paused: { label: "Pausada", rarity: "legendary" },
    ended: { label: "Encerrada", rarity: "common" },
    archived: { label: "Arquivada", rarity: "common" },
}

/** Fases em que não se convida mais ninguém (o link responde 409). */
export const MADDOX_INVITE_CLOSED_STATUSES: readonly MaddoxCampaignStatus[] = ["ended", "archived"]

/** Fases em que o dono pode reiniciar a campanha (DND-50): já começou e não está no lobby nem em entrevista. */
export const MADDOX_RESET_STATUSES: readonly MaddoxCampaignStatus[] = ["active", "paused", "ended", "archived"]

/** Reiniciar a campanha (DND-50): textos da tela e das recusas. */
export const MADDOX_RESET_TEXTS = {
    button: "Reiniciar campanha",
    dialogTitle: "Reiniciar campanha?",
    dialogBody:
        "A história jogada, o diário, os NPCs, os combates, as imagens de cena e as memórias da campanha serão apagados. Os personagens voltam à ficha do fim da entrevista. Membros, cenário e configurações são mantidos. Essa ação não pode ser desfeita.",
    cancel: "Cancelar",
    notice: "O dono reiniciou a campanha.",
    forbidden: "Só o dono da campanha pode reiniciá-la.",
    notStarted: "A campanha ainda não começou: não há o que reiniciar.",
    inProgress: "O reinício da campanha ainda está em andamento.",
    sheetsAdjusting: "O Maddox está ajustando as fichas.",
    memoriesPending: "A rede de memórias está indisponível: as memórias da partida anterior ainda não foram apagadas. Tente de novo em instantes.",
    retry: "Tentar de novo",
} as const

/** Parâmetro da tela da campanha que mostra o aviso do reinício (a mesa aberta redireciona com ele). */
export const MADDOX_RESET_NOTICE_PARAM = "aviso"
export const MADDOX_RESET_NOTICE_VALUE = "reiniciada"

/** Aviso ao dono quando o Maddox não conseguiu devolver a ficha ao fim da entrevista (DND-50). */
export const maddoxSheetRestoreFailedMessage = (characterName: string) => `O Maddox não conseguiu ajustar a ficha de ${characterName || "um personagem"}. A ficha ficou como estava.`

/** Situações do ajuste da ficha pelo Maddox depois do reinício (DND-50). */
export const MADDOX_SHEET_RESTORE_STATUSES = ["pending", "done", "failed"] as const
export type MaddoxSheetRestoreStatus = (typeof MADDOX_SHEET_RESTORE_STATUSES)[number]
/** Ajuste `pending` sem execução viva depois disto (processo reiniciado) vira falha. */
export const MADDOX_SHEET_RESTORE_STALE_MS = 10 * 60 * 1000
/** Teto de uma geração do ajuste da ficha. */
export const MADDOX_SHEET_RESTORE_TIMEOUT_MS = 4 * 60 * 1000
/** Folga para o job interrompido pelo reinício terminar (o que ele ainda gravar sai na limpeza que vem depois na fila). */
export const MADDOX_JOB_ABORT_GRACE_MS = 15_000
/** Espera máxima pelas execuções vivas dos Personagens Opex antes da limpeza do reinício. */
export const MADDOX_RESET_OPEX_WAIT_MS = 5_000

export const MADDOX_CAMPAIGN_AUDIT_ENTITY = "CampanhaMaddox"
/** Correções do Maddox na ficha de um personagem (DND-41: preparação do combate e pedidos de ajuste). */
export const MADDOX_SHEET_AUDIT_ENTITY = "FichaPersonagem"
export const MADDOX_CAMPAIGN_NAME_MIN = 3
export const MADDOX_CAMPAIGN_NAME_MAX = 80
export const MADDOX_CHARACTER_NAME_MIN = 2
export const MADDOX_CHARACTER_NAME_MAX = 60

/** Evento do canal do usuário (`private-maddox-u-{userId}`): algo mudou numa campanha da qual ele participa. */
export const MADDOX_CAMPAIGN_CHANGED_EVENT = "maddox.campaign.changed"

export const MADDOX_MEMBER_ROLES = ["owner", "player"] as const
export type MaddoxMemberRole = (typeof MADDOX_MEMBER_ROLES)[number]

/** Tipo do membro (DND-26): pessoa ou Personagem Opex (controlado por IA, adicionado pelo dono). */
export const MADDOX_MEMBER_KINDS = ["human", "opex"] as const
export type MaddoxMemberKind = (typeof MADDOX_MEMBER_KINDS)[number]

export const MADDOX_MEMBER_STATUSES = ["invited", "joined", "left", "removed"] as const
export type MaddoxMemberStatus = (typeof MADDOX_MEMBER_STATUSES)[number]

export const MADDOX_INTERVIEW_STATUSES = ["pending", "in-progress", "done"] as const
export type MaddoxInterviewStatus = (typeof MADDOX_INTERVIEW_STATUSES)[number]

export const MADDOX_CHARACTER_STATUSES = ["active", "inactive", "dead", "retired"] as const
export type MaddoxCharacterStatus = (typeof MADDOX_CHARACTER_STATUSES)[number]

export const MADDOX_NPC_STATUSES = ["active", "inactive", "dead", "unknown"] as const
export type MaddoxNpcStatus = (typeof MADDOX_NPC_STATUSES)[number]

/** Quem vê um registro da campanha: os jogadores ou só o mestre (Maddox). */
export const MADDOX_VISIBILITIES = ["players", "master"] as const
export type MaddoxVisibility = (typeof MADDOX_VISIBILITIES)[number]

export const MADDOX_CAMPAIGN_MEMORY_KINDS = ["fato", "evento", "local", "missao", "relacao", "outro"] as const
export type MaddoxCampaignMemoryKind = (typeof MADDOX_CAMPAIGN_MEMORY_KINDS)[number]

/** Situação de uma memória do tipo `missao` (os demais tipos não usam). */
export const MADDOX_QUEST_STATUSES = ["ativa", "concluida", "falhou", "abandonada"] as const
export type MaddoxQuestStatus = (typeof MADDOX_QUEST_STATUSES)[number]

/** Campos do estado atual da história (`campaign.state`) que o Maddox mantém e o Diário da campanha mostra. */
export const MADDOX_CAMPAIGN_STATE_FIELDS = ["scene", "location", "situation", "pendingDecision"] as const
export type MaddoxCampaignStateField = (typeof MADDOX_CAMPAIGN_STATE_FIELDS)[number]

/** Rótulos dos tipos de memória da campanha (Diário da campanha, Maddox 9). */
export const MADDOX_CAMPAIGN_MEMORY_KIND_LABELS: Record<MaddoxCampaignMemoryKind, string> = {
    fato: "Fato",
    evento: "Evento",
    local: "Local",
    missao: "Missão",
    relacao: "Relação",
    outro: "Outro",
}

/** Situação das missões com a cor de raridade (Diário da campanha). */
export const MADDOX_QUEST_STATUS_DEFS: Record<MaddoxQuestStatus, { label: string; rarity: MaddoxRarity }> = {
    ativa: { label: "Ativa", rarity: "rare" },
    concluida: { label: "Concluída", rarity: "uncommon" },
    falhou: { label: "Falhou", rarity: "legendary" },
    abandonada: { label: "Abandonada", rarity: "common" },
}

/** Situação dos NPCs para os jogadores. */
export const MADDOX_NPC_STATUS_LABELS: Record<MaddoxNpcStatus, string> = { active: "Ativo", inactive: "Inativo", dead: "Morto", unknown: "Paradeiro desconhecido" }

// ── Avatares (DND-55) ─────────────────────────────────────────────────────────

/** Linha de contexto do popover e do retrato grande de cada avatar: quem é. */
export const MADDOX_AVATAR_CONTEXT = {
    maddox: "Mestre da mesa",
    character: "Personagem",
    mine: "Seu personagem",
    opex: "Personagem Opex",
    npc: "NPC",
    opexNpc: "NPC Opex",
    owner: "Dono",
    player: "Jogador",
} as const

/** "NPC" (ou "NPC Opex"), com a situação quando não está ativo: "NPC · Morto". */
export function npcAvatarContext(status: MaddoxNpcStatus, opex = false) {
    const label = opex ? MADDOX_AVATAR_CONTEXT.opexNpc : MADDOX_AVATAR_CONTEXT.npc
    return status === "active" ? label : `${label} · ${MADDOX_NPC_STATUS_LABELS[status]}`
}

/** Personagem que falou ou agiu na mesa: "Personagem Opex", "Seu personagem" ou "Personagem". */
export const messageAvatarContext = ({ opex, mine }: { opex?: boolean; mine: boolean }) => (opex ? MADDOX_AVATAR_CONTEXT.opex : mine ? MADDOX_AVATAR_CONTEXT.mine : MADDOX_AVATAR_CONTEXT.character)

/** Personagem de um membro: "Personagem Opex", ou o papel com o nome de quem joga ("Jogador · Ana"). */
export function memberAvatarContext({ opex, role, playerName }: { opex?: boolean; role?: "owner" | "player" | null; playerName?: string | null }) {
    if (opex) return MADDOX_AVATAR_CONTEXT.opex
    const label = role === "owner" ? MADDOX_AVATAR_CONTEXT.owner : role === "player" ? MADDOX_AVATAR_CONTEXT.player : MADDOX_AVATAR_CONTEXT.character
    return playerName ? `${label} · ${playerName}` : label
}

export const MADDOX_TURN_PHASES = ["master", "players"] as const
export type MaddoxTurnPhase = (typeof MADDOX_TURN_PHASES)[number]

// ── Mesa e turnos (Maddox 3) ──────────────────────────────────────────────────

/** Evento do canal do usuário: a mesa (turno ou mensagens) de uma campanha mudou. */
export const MADDOX_GAME_CHANGED_EVENT = "maddox.game.changed"

/**
 * Mensagens da mesa: narração do mestre, declaração do jogador, "não fazer nada" (`pass`), pergunta ao
 * mestre (não encerra o turno), a resposta dele, o teste pedido pelo Maddox (`check`, Maddox 5), o card de
 * início/fim de combate (`combat`, Maddox 6) e, no combate tático (Maddox 7), a ação de um combatente (`combat-action`),
 * uma rolagem avulsa (`combat-roll`: iniciativa, salvaguarda, teste contra a morte, concentração, dano) e a janela de
 * reação (`combat-reaction`). `rewind` (DND-44) é a linha de aviso "O dono voltou a mesa para o turno X" / "O dono retomou o
 * turno N": nunca é descartada e fica fora da transcrição do narrador, do Opex e da busca do Diário.
 */
export const MADDOX_GAME_MESSAGE_KINDS = ["narration", "declaration", "pass", "question", "answer", "check", "combat", "combat-action", "combat-roll", "combat-reaction", "reminder", "combat-prep", "rewind", "hit-points", "sheet-change", "rest", "rest-request"] as const
export type MaddoxGameMessageKind = (typeof MADDOX_GAME_MESSAGE_KINDS)[number]

/** O que o jogador envia no próprio turno. */
export const MADDOX_GAME_ACTION_KINDS = ["declaration", "pass", "question"] as const
export type MaddoxGameActionKind = (typeof MADDOX_GAME_ACTION_KINDS)[number]

export const MADDOX_GAME_MESSAGE_MAX = 4_000

// ── Injetar Lembrança (DND-25) ────────────────────────────────────────────────

/** Tamanho máximo de uma lembrança injetada por um jogador. */
export const MADDOX_REMINDER_MAX_CHARS = 500
export const MADDOX_REMINDER_STATUSES = ["pending", "saved", "discarded"] as const
export type MaddoxReminderStatus = (typeof MADDOX_REMINDER_STATUSES)[number]
export const MADDOX_REMINDER_STATUS_LABELS: Record<MaddoxReminderStatus, string> = {
    pending: "Aguardando o Maddox",
    saved: "Guardada como memória",
    discarded: "Usada só neste turno",
}
export const MADDOX_REMINDER_PLACEHOLDER = "Ex.: lembre-se que tenho o talento Alerta e não posso ser surpreendido"
/** Mensagens por página da mesa (as mais recentes; "Carregar anteriores" busca o resto). */
export const MADDOX_GAME_PAGE_SIZE = 100
/** Trava do turno do mestre mais antiga que isto é retomada (geração interrompida). */
export const MADDOX_MASTER_LOCK_STALE_MS = 2 * 60 * 1000
/** Depois de uma falha do turno do mestre, a próxima tentativa espera este intervalo (sem laço de retomadas). */
export const MADDOX_MASTER_RETRY_MS = 30 * 1000

export const MADDOX_TURN_PHASE_LABELS: Record<MaddoxTurnPhase, string> = {
    master: "Turno do mestre",
    players: "Turno dos jogadores",
}

// ── Narrador (Maddox 4) ───────────────────────────────────────────────────────

/**
 * Graus de rigor que validam a ação livre no momento da declaração (inválida = recusada, o jogador reescreve).
 * Os demais julgam na narração: a ação impossível vira uma tentativa frustrada narrada na ficção.
 */
export const MADDOX_DECLARATION_VALIDATION_RIGORS: readonly MaddoxRigorLevel[] = ["rigoroso", "fiel-dnd"]

/** Enquanto o mestre gera, a trava do turno é renovada neste intervalo (a trava velha só vale para quedas). */
export const MADDOX_MASTER_HEARTBEAT_MS = 30 * 1000
/**
 * Teto de duração de cada geração do mestre (narração ou resposta). Passou disso, a geração é abortada e tratada como
 * falha (`failedAt`, trava liberada): um provedor que para de responder não segura a fila da campanha nem o pulso da trava.
 */
export const MADDOX_MASTER_GENERATION_TIMEOUT_MS = 5 * 60 * 1000
export const MADDOX_MASTER_TIMEOUT_MESSAGE = "O Maddox demorou demais para responder."
/**
 * Teto da validação da ação livre ao declarar (roda dentro da requisição do jogador): passado, a validação é abandonada
 * e a declaração é ACEITA, como em qualquer falha do validador.
 */
export const MADDOX_VALIDATION_TIMEOUT_MS = 20_000
/**
 * Tetos de PROTEÇÃO dos textos gravados pelas ferramentas do narrador (não são limites de uso): bem acima do tamanho
 * orientado no prompt (`MADDOX_TOOL_TEXT_GUIDE` caracteres por anotação), só barram um texto descontrolado. Um texto cortado
 * é avisado ao modelo no retorno da ferramenta (`truncated`), para ele consolidar em vez de perder conteúdo calado.
 */
export const MADDOX_TOOL_TEXT_MAX = 20_000
export const MADDOX_TOOL_NAME_MAX = 120
export const MADDOX_TOOL_TAG_MAX = 60
export const MADDOX_TOOL_TAGS_MAX = 12
/** Tamanho orientado no prompt para cada anotação consolidada. */
export const MADDOX_TOOL_TEXT_GUIDE = 3_000
/** Passos do laço de ferramentas por geração do narrador. */
export const MADDOX_NARRATOR_MAX_STEPS = 16
/** Transcrição recente enviada ao narrador (o estado gravado cobre o que fica de fora). */
export const MADDOX_NARRATOR_HISTORY_CHARS = 40_000
/** Itens de cada lista no índice do estado entregue ao narrador. */
export const MADDOX_NARRATOR_INDEX_ITEMS = 40

/** Origens do consumo de IA do narrador (painel de consumo). */
export const MADDOX_NARRATION_CONSUMPTION_ORIGIN = "maddox-narration"
export const MADDOX_VALIDATION_CONSUMPTION_ORIGIN = "maddox-validation"
export const MADDOX_COMBAT_PREP_CONSUMPTION_ORIGIN = "maddox-combat-prep"
export const MADDOX_COMBAT_ADJUST_CONSUMPTION_ORIGIN = "maddox-combat-adjust"
export const MADDOX_SNEAK_ATTACK_CONSUMPTION_ORIGIN = "maddox-sneak-attack"
export const MADDOX_SHEET_RESTORE_CONSUMPTION_ORIGIN = "maddox-sheet-restore"

/** Servidor MCP do Maddox registrado no OpenCode (ferramentas do narrador quando o provedor é o OpenCode). */
export const MADDOX_MCP_SERVER_NAME = "dndicas-maddox"
export const MADDOX_MCP_PATH = "/api/maddox/mcp"
/** Validade do token de turno que o OpenCode envia às ferramentas do MCP. */
export const MADDOX_TURN_TOKEN_TTL_MS = 20 * 60 * 1000

/** Resposta gravada quando a geração da resposta a uma pergunta falha. */
export const MADDOX_ANSWER_FAILED_MESSAGE = "O Maddox não conseguiu responder agora. Pergunte de novo."

// ── Fichas e testes (Maddox 5) ─────────────────────────────────────────────────

/** Graus em que o Maddox pede testes de atributo, perícia ou resistência (os mesmos que criam a ficha D&D). */
export const MADDOX_CHECK_RIGORS: readonly MaddoxRigorLevel[] = ["equilibrado", "rigoroso", "fiel-dnd"]
/** Rodadas de teste por turno do mestre (a última narração não pode pedir novos testes). */
export const MADDOX_CHECK_ROUNDS_MAX = 3
export const MADDOX_CHECK_KINDS = ["skill", "ability", "save"] as const
export type MaddoxCheckKind = (typeof MADDOX_CHECK_KINDS)[number]
export const MADDOX_CHECK_KIND_LABELS: Record<MaddoxCheckKind, string> = { skill: "Teste de perícia", ability: "Teste de atributo", save: "Teste de resistência" }
export const MADDOX_CHECK_STATUSES = ["pending", "rolled", "cancelled"] as const
export type MaddoxCheckStatus = (typeof MADDOX_CHECK_STATUSES)[number]
export const MADDOX_CHECK_MODES = ["normal", "advantage", "disadvantage"] as const
export type MaddoxCheckMode = (typeof MADDOX_CHECK_MODES)[number]
export const MADDOX_CHECK_MODE_LABELS: Record<MaddoxCheckMode, string> = { normal: "Normal", advantage: "Vantagem", disadvantage: "Desvantagem" }
export const MADDOX_CHECK_DC_MIN = 1
export const MADDOX_CHECK_DC_MAX = 30
/** Tamanho orientado do motivo público do teste (só orientação: o corte é o teto de proteção `MADDOX_TOOL_TEXT_MAX`). */
export const MADDOX_CHECK_REASON_GUIDE = 200
/** Consulta do JEV "Pedir teste" (orientação ao narrador): passou disso, a orientação é ignorada. */
export const MADDOX_CHECK_HINT_TIMEOUT_MS = 20_000
/** Tempo (ms) que o dado do teste fica no card depois de parar, antes de sumir com animação. */
export const MADDOX_CHECK_DIE_HIDE_MS = 1_400
/**
 * Teto (ms) que um card de combate segura o dado de um passo esperando a animação terminar e o palco sair (DND-48): se o
 * palco nunca avisar, o card libera o passo e segue para o próximo.
 */
export const MADDOX_COMBAT_ROLL_HOLD_MAX_MS = 10_000

// ── Combate narrativo (Maddox 6) ───────────────────────────────────────────────

/**
 * Graus com combate narrativo registrado (início, desfecho e recompensas pelas ferramentas do Maddox). Rigoroso e Fiel ao
 * D&D usam o combate tático do Maddox 7 (`MADDOX_TACTICAL_COMBAT_RIGORS`), que reaproveita o mesmo registro.
 */
export const MADDOX_COMBAT_RIGORS: readonly MaddoxRigorLevel[] = ["narrativo", "flexivel", "equilibrado"]
/** Graus com combate tático (Maddox 7): iniciativa, turnos por combatente, Ação e Ação bônus por botões. */
export const MADDOX_TACTICAL_COMBAT_RIGORS: readonly MaddoxRigorLevel[] = ["rigoroso", "fiel-dnd"]
/** Graus em que as recompensas do combate entram na ficha D&D (todos os graus com ficha). */
export const MADDOX_COMBAT_SHEET_REWARD_RIGORS: readonly MaddoxRigorLevel[] = ["equilibrado", "rigoroso", "fiel-dnd"]

export const MADDOX_COMBAT_STATUSES = ["active", "ended"] as const
export type MaddoxCombatStatus = (typeof MADDOX_COMBAT_STATUSES)[number]

/** Resultado do combate para o grupo. */
export const MADDOX_COMBAT_OUTCOMES = ["vitoria", "derrota", "fuga", "tregua", "interrompido"] as const
export type MaddoxCombatOutcome = (typeof MADDOX_COMBAT_OUTCOMES)[number]
export const MADDOX_COMBAT_OUTCOME_LABELS: Record<MaddoxCombatOutcome, string> = {
    vitoria: "Vitória",
    derrota: "Derrota",
    fuga: "Fuga",
    tregua: "Trégua",
    interrompido: "Interrompido",
}

/** Lado de quem participa do combate (além dos personagens dos jogadores). */
export const MADDOX_COMBATANT_SIDES = ["inimigo", "aliado"] as const
export type MaddoxCombatantSide = (typeof MADDOX_COMBATANT_SIDES)[number]

/** Desfecho de cada adversário ou aliado. */
export const MADDOX_COMBATANT_OUTCOMES = ["morto", "derrotado", "capturado", "rendeu-se", "fugiu", "poupado", "ileso"] as const
export type MaddoxCombatantOutcome = (typeof MADDOX_COMBATANT_OUTCOMES)[number]
export const MADDOX_COMBATANT_OUTCOME_LABELS: Record<MaddoxCombatantOutcome, string> = {
    morto: "Morto",
    derrotado: "Derrotado",
    capturado: "Capturado",
    "rendeu-se": "Rendeu-se",
    fugiu: "Fugiu",
    poupado: "Poupado",
    ileso: "Ileso",
}

export const MADDOX_COMBAT_REWARD_KINDS = ["moedas", "item", "outro"] as const
export type MaddoxCombatRewardKind = (typeof MADDOX_COMBAT_REWARD_KINDS)[number]
/** Moedas do D&D: po (ouro), pp (prata), pe (electrum), pc (cobre), pl (platina). */
export const MADDOX_COIN_KEYS = ["po", "pp", "pe", "pc", "pl"] as const
export type MaddoxCoinKey = (typeof MADDOX_COIN_KEYS)[number]
/** Campo de `sheet.coins` de cada moeda. */
export const MADDOX_COIN_SHEET_FIELDS: Record<MaddoxCoinKey, "gp" | "sp" | "ep" | "cp" | "pp"> = { po: "gp", pp: "sp", pe: "ep", pc: "cp", pl: "pp" }
/** Teto de cada moeda por recompensa (proteção contra número descontrolado). */
export const MADDOX_COMBAT_COINS_MAX = 100_000
export const MADDOX_COMBAT_ITEM_QUANTITY_MAX = 999
export const MADDOX_COMBAT_REWARDS_MAX = 20
export const MADDOX_COMBATANTS_MAX = 30
/** A partir de tantas narrações em combate, o prompt lembra o Maddox de conduzir a luta a um desfecho. */
export const MADDOX_COMBAT_LONG_TURNS = 6
/** Consulta do JEV "Início ou fim de combate" (orientação ao narrador): passou disso, a orientação é ignorada. */
export const MADDOX_COMBAT_HINT_TIMEOUT_MS = 20_000
/**
 * Situação da imagem de fim de batalha: `requested` = imagem pedida (Maddox 10, `maddox_scene_images`), `skipped` = sem
 * situação ativa, sem cena final ou fora da frequência; `awaiting-feature` = combates encerrados antes do Maddox 10.
 */
export const MADDOX_COMBAT_IMAGE_STATUSES = ["awaiting-feature", "requested", "skipped"] as const
export type MaddoxCombatImageStatus = (typeof MADDOX_COMBAT_IMAGE_STATUSES)[number]

// ── Imagens nas cenas (Maddox 10) ──────────────────────────────────────────────

/** Situações fixas em que o Maddox gera imagem (cada uma com chave ativa na aba). */
export const MADDOX_SCENE_IMAGE_SITUATIONS = ["campaign-opening", "new-location", "combat-end", "climax", "important-npc", "quest-completed", "npc-portrait"] as const
export type MaddoxSceneImageSituation = (typeof MADDOX_SCENE_IMAGE_SITUATIONS)[number]

export const MADDOX_SCENE_IMAGE_SITUATION_DEFS: Record<MaddoxSceneImageSituation, { label: string; description: string }> = {
    "campaign-opening": { label: "Abertura da campanha", description: "A primeira narração da campanha, que apresenta o cenário e a situação inicial." },
    "new-location": { label: "Novo local ou cenário", description: "O grupo chega a um lugar que ainda não apareceu na história ou o cenário muda de forma marcante." },
    "combat-end": { label: "Fim de batalha", description: "Automática: quando um combate termina, a cena final escrita pelo Maddox vira imagem." },
    climax: { label: "Clímax ou cena importante", description: "Um momento decisivo, uma revelação ou uma virada da história." },
    "important-npc": { label: "Primeiro encontro com NPC importante", description: "Um NPC que vai ter peso na história aparece pela primeira vez diante do grupo." },
    "quest-completed": { label: "Missão concluída", description: "Uma missão termina (com sucesso ou não) e a cena mostra o desfecho." },
    "npc-portrait": { label: "Retrato de NPC", description: "Quando o Maddox marca um NPC como importante, ele ganha um retrato (uma vez) que aparece em \"NPCs conhecidos\"." },
}

/** Retrato automático de NPC (DND-43): chave própria, independente da situação "Retrato de NPC". */
export const MADDOX_SCENE_IMAGE_AUTO_PORTRAITS_DEF = {
    label: "Retrato automático de NPC",
    description: "Quando um NPC passa a ser conhecido dos jogadores (ou é atualizado ainda sem retrato), ganha um retrato, sem o Maddox precisar pedir. Uma vez por NPC; conta no teto diário.",
} as const

/** Origem da imagem: ferramenta do narrador, fim de combate, botão do dono ou retrato de NPC. */
export const MADDOX_SCENE_IMAGE_SOURCES = ["tool", "combat-end", "manual", "npc-portrait"] as const
export type MaddoxSceneImageSource = (typeof MADDOX_SCENE_IMAGE_SOURCES)[number]

/**
 * Vaga ocupada: só as automáticas (`auto`) respeitam o intervalo e a regra de uma por turno. `discarded` (DND-44) é a lápide
 * da imagem de um trecho perdido de vez ao voltar a um turno: sai da regra de uma por turno e continua no teto diário.
 */
export const MADDOX_SCENE_IMAGE_SLOTS = ["auto", "manual", "portrait", "discarded"] as const
export type MaddoxSceneImageSlot = (typeof MADDOX_SCENE_IMAGE_SLOTS)[number]

export const MADDOX_SCENE_IMAGE_STATUSES = ["pending", "generating", "done", "failed", "skipped"] as const
export type MaddoxSceneImageStatus = (typeof MADDOX_SCENE_IMAGE_STATUSES)[number]

/** Intervalo mínimo entre imagens automáticas, em turnos do mestre (0 = sem intervalo). */
export const MADDOX_SCENE_IMAGE_GAP_MAX = 50
export const MADDOX_SCENE_IMAGE_GAP_DEFAULT = 3
/** Teto de imagens por campanha em 24 h (todas as origens). */
export const MADDOX_SCENE_IMAGE_DAILY_MAX = 100
export const MADDOX_SCENE_IMAGE_DAILY_DEFAULT = 10
export const MADDOX_SCENE_IMAGE_WINDOW_MS = 24 * 60 * 60 * 1000
/** Situações personalizadas criadas pelo admin. */
export const MADDOX_SCENE_IMAGE_CUSTOM_MAX = 10
export const MADDOX_SCENE_IMAGE_CUSTOM_LABEL_MAX = 60
export const MADDOX_SCENE_IMAGE_CUSTOM_DESCRIPTION_MAX = 300
export const MADDOX_SCENE_IMAGE_STYLE_MAX = 2000
/**
 * Legenda pública: `GUIDE` é o tamanho orientado ao modelo; `MAX` é só o teto de PROTEÇÃO (bem acima da orientação), o único
 * ponto de corte. Descrição visual: teto de proteção (corta e avisa, nunca invalida).
 */
export const MADDOX_SCENE_IMAGE_CAPTION_GUIDE = 160
export const MADDOX_SCENE_IMAGE_CAPTION_MAX = 500
export const MADDOX_SCENE_IMAGE_DESCRIPTION_MAX = 4000
/**
 * Sugestões de ação (DND-30): até `MAX` por personagem em cada narração. `GUIDE` é o tamanho orientado de cada uma; `TEXT_MAX`
 * é só o teto de PROTEÇÃO (corta e avisa, nunca invalida a chamada).
 */
export const MADDOX_ACTION_OPTIONS_MAX = 4
export const MADDOX_ACTION_OPTION_GUIDE = 120
export const MADDOX_ACTION_OPTION_TEXT_MAX = 300
/** Imagens de referência enviadas ao gerador (personagens → NPCs → catálogo). */
export const MADDOX_SCENE_IMAGE_REFERENCES_MAX = 6
export const MADDOX_SCENE_IMAGE_REFERENCE_BYTES_MAX = 5 * 1024 * 1024
export const MADDOX_SCENE_IMAGE_REFERENCE_TIMEOUT_MS = 10_000
/** Teto de uma geração de imagem; passado, a imagem falha. */
export const MADDOX_SCENE_IMAGE_TIMEOUT_MS = 120_000
/** Imagem `pending`/`generating` há mais que isso (processo reiniciado) vira falha. */
export const MADDOX_SCENE_IMAGE_STALE_MS = 5 * 60 * 1000
/** Gerações de imagem simultâneas no processo. */
export const MADDOX_SCENE_IMAGE_CONCURRENCY = 2
/** Descrição da cena pelo narrador no pedido manual (geração curta e efêmera). */
export const MADDOX_SCENE_IMAGE_DESCRIBE_TIMEOUT_MS = 30_000
/** JEV "Gerar imagem na cena": passou disso, gera sem o filtro. */
export const MADDOX_SCENE_IMAGE_JEV_TIMEOUT_MS = 20_000
export const MADDOX_SCENE_IMAGE_CONSUMPTION_ORIGIN = "maddox-scene-image"
export const MADDOX_SCENE_IMAGE_FAILED_MESSAGE = "Não foi possível gerar a imagem desta cena."
/**
 * Aparência dos personagens nas imagens (DND-33): anotações da campanha (canal dos jogadores) que citam o personagem e
 * falam da aparência — até `MAX` por personagem, cada uma cortada em `TEXT_MAX`; a busca tem prazo (falha = sem elas).
 */
export const MADDOX_SCENE_IMAGE_APPEARANCE_MEMORIES_MAX = 3
export const MADDOX_SCENE_IMAGE_APPEARANCE_MEMORY_TEXT_MAX = 400
export const MADDOX_SCENE_IMAGE_APPEARANCE_MEMORIES_TIMEOUT_MS = 5_000
/**
 * Termos (sem acento, minúsculos) que marcam uma anotação como de aparência. Palavra inteira (também no plural com "s"),
 * menos os radicais terminados em `*`, que casam pelo começo da palavra — só radicais sem palavras comuns fora de aparência
 * ("olho" não casa "olhou", "capa" não casa "capaz", "porte" não casa "porteiro").
 */
export const MADDOX_APPEARANCE_TERMS = [
    "aparenc*", "aspecto", "visual", "cabel*", "madeix*", "careca", "calvo", "calva", "barba", "bigode", "olho", "pele", "rosto",
    "cicatri*", "tatuag*", "queimadura", "altura", "estatura", "porte", "magro", "magra", "muscul*", "corpulent*", "robust*",
    "roupa", "veste", "vestido", "vestida", "traje", "capa", "manto", "capuz", "tunica", "armadura", "elmo", "botas", "luvas",
    "joia", "anel", "brinco", "chifre", "orelha", "asa", "cauda", "escama", "pelagem", "tingi*", "prata", "pratead*", "loir*",
    "ruiv*", "moren*", "grisalh*", "castanh*", "branco", "branca", "preto", "preta",
] as const
/** Pedido manual: tetos do último turno (declarações, testes e narrações) e da narração do turno anterior (só contexto). */
export const MADDOX_SCENE_IMAGE_LAST_TURN_TEXT_MAX = 8000
export const MADDOX_SCENE_IMAGE_PREVIOUS_TURN_TEXT_MAX = 1500

// ── Retrato do personagem (DND-31) ─────────────────────────────────────────────

/** Situação do retrato gerado ao concluir a entrevista de personagem (`null` = nunca pedido). */
export const MADDOX_CHARACTER_PORTRAIT_STATUSES = ["pending", "generating", "done", "failed"] as const
export type MaddoxCharacterPortraitStatus = (typeof MADDOX_CHARACTER_PORTRAIT_STATUSES)[number]
/** Teto de uma geração do retrato; passado, o retrato falha. */
export const MADDOX_CHARACTER_PORTRAIT_TIMEOUT_MS = 120_000
/** Retrato `pending`/`generating` há mais que isso, fora do processo, vira falha (processo reiniciado). */
export const MADDOX_CHARACTER_PORTRAIT_STALE_MS = 5 * 60 * 1000
export const MADDOX_CHARACTER_PORTRAIT_CONSUMPTION_ORIGIN = "maddox-character-portrait"
export const MADDOX_CHARACTER_PORTRAIT_FAILED_MESSAGE = "Não foi possível gerar o retrato do personagem."
/** Rótulo do personagem que ainda não tem nome (o nome vem da entrevista). */
export const MADDOX_CHARACTER_UNNAMED_LABEL = "Personagem em criação"

// ── Combate tático (Maddox 7) ──────────────────────────────────────────────────

/** Condições do D&D (chaves do catálogo de Monstros) e os nomes em pt-BR. */
export const MADDOX_CONDITIONS = ["blinded", "charmed", "deafened", "exhaustion", "frightened", "grappled", "incapacitated", "invisible", "paralyzed", "petrified", "poisoned", "prone", "restrained", "stunned", "unconscious"] as const
export type MaddoxConditionKey = (typeof MADDOX_CONDITIONS)[number]
export const MADDOX_CONDITION_LABELS: Record<MaddoxConditionKey, string> = {
    blinded: "Cego",
    charmed: "Enfeitiçado",
    deafened: "Surdo",
    exhaustion: "Exausto",
    frightened: "Amedrontado",
    grappled: "Agarrado",
    incapacitated: "Incapacitado",
    invisible: "Invisível",
    paralyzed: "Paralisado",
    petrified: "Petrificado",
    poisoned: "Envenenado",
    prone: "Caído",
    restrained: "Contido",
    stunned: "Atordoado",
    unconscious: "Inconsciente",
}

/** Ações comuns do D&D (PHB 2024) oferecidas no menu "Ações comuns". "Atacar" e "Magia" abrem Armas e Magias. */
export const MADDOX_STANDARD_ACTIONS = ["dash", "disengage", "dodge", "help", "hide", "influence", "ready", "search", "study", "utilize"] as const
export type MaddoxStandardAction = (typeof MADDOX_STANDARD_ACTIONS)[number]
export const MADDOX_STANDARD_ACTION_DEFS: Record<MaddoxStandardAction, { label: string; detail: string }> = {
    dash: { label: "Disparada", detail: "Movimento extra igual ao seu deslocamento neste turno." },
    disengage: { label: "Desengajar", detail: "Seu movimento não provoca ataques de oportunidade neste turno." },
    dodge: { label: "Esquivar", detail: "Até o seu próximo turno, ataques contra você têm desvantagem e você tem vantagem em salvaguardas de Destreza." },
    help: { label: "Ajudar", detail: "Um aliado tem vantagem no próximo ataque contra um inimigo a até 1,5 m de você." },
    hide: { label: "Esconder", detail: "Teste de Destreza (Furtividade) CD 15; no sucesso, você fica Invisível." },
    influence: { label: "Influenciar", detail: "Teste de Carisma (Enganação, Intimidação, Atuação ou Persuasão) para influenciar uma criatura." },
    ready: { label: "Preparar", detail: "Escolha uma ação e o gatilho: ela vira a sua reação quando o gatilho acontecer." },
    search: { label: "Procurar", detail: "Teste de Sabedoria (Intuição, Medicina, Percepção ou Sobrevivência)." },
    study: { label: "Estudar", detail: "Teste de Inteligência (Arcanismo, História, Investigação, Natureza ou Religião)." },
    utilize: { label: "Utilizar", detail: "Usar um objeto que não é arma nem consumível (alavanca, porta, corda)." },
}

/** Custo de uma habilidade, talento ou magia no combate (classificador: texto + JEV). */
export const MADDOX_COMBAT_COSTS = ["action", "bonus", "reaction", "passive", "other"] as const
export type MaddoxCombatCost = (typeof MADDOX_COMBAT_COSTS)[number]
/** Gatilho de uma reação. */
export const MADDOX_REACTION_TRIGGERS = ["hit", "damaged", "leave-reach", "spell", "ready", "other"] as const
export type MaddoxReactionTrigger = (typeof MADDOX_REACTION_TRIGGERS)[number]
export const MADDOX_REACTION_TRIGGER_LABELS: Record<MaddoxReactionTrigger, string> = {
    hit: "atingido por um ataque",
    damaged: "sofreu dano",
    "leave-reach": "inimigo saindo do alcance",
    spell: "inimigo conjurando uma magia",
    ready: "gatilho da ação preparada",
    other: "outro gatilho",
}
/** Como uma magia (ou habilidade) é resolvida pelo servidor; `utility` vai para o Maddox. */
export const MADDOX_COMBAT_RESOLUTIONS = ["attack", "save", "heal", "auto", "utility"] as const
export type MaddoxCombatResolution = (typeof MADDOX_COMBAT_RESOLUTIONS)[number]

/** Janela de reação: passado o prazo, o personagem não reage. Jogador offline recusa na hora. */
export const MADDOX_REACTION_TIMEOUT_MS = 45_000
/** Jogador offline na própria vez: a vez passa depois desta carência (recarregar a página não perde a vez). */
export const MADDOX_COMBAT_OFFLINE_GRACE_MS = 30_000
/** Esperas (testes, rolagens e reações) por turno do mestre em combate; acima disso, o ataque se resolve sem reação. */
export const MADDOX_COMBAT_WAIT_ROUNDS_MAX = 10
/** Classificação do custo de uma habilidade pelo JEV (em segundo plano): passou disso, fica em "Outras habilidades". */
export const MADDOX_COMBAT_CLASSIFY_TIMEOUT_MS = 20_000
/** Depois de mandar uma habilidade ao JEV (ou achar a chave desligada), espera isto antes de tentar de novo. */
export const MADDOX_COMBAT_CLASSIFY_RETRY_MS = 10 * 60_000
/** Trava de uma rolagem do combate (passo da ação ou rolagem avulsa) mais velha que isto é considerada abandonada. */
export const MADDOX_COMBAT_ROLL_CLAIM_STALE_MS = 30_000
/** Narrações com todos os inimigos (ou todos os personagens) caídos antes de o servidor encerrar o combate sozinho. */
export const MADDOX_COMBAT_FORCE_END_AFTER = 2
/** Texto livre ("Outra ação") e o "Movimento e posição" do fim da vez. */
export const MADDOX_COMBAT_FREE_TEXT_MAX = 1_000
/** Alvos de uma magia de área. */
export const MADDOX_COMBAT_TARGETS_MAX = 12

// ── Preparação da mesa de combate (DND-41) ────────────────────────────────────

/**
 * Teto técnico de UMA geração da preparação de uma ficha; passou disso, a preparação falha e o dono decide. DND-49: com
 * as consultas ao catálogo por ferramenta (várias idas e voltas), o teto subiu de 3 para 6 min.
 */
export const MADDOX_COMBAT_PREP_TIMEOUT_MS = 6 * 60_000
/** DND-49: passos do laço de ferramentas (consultas ao catálogo + resposta) na preparação e no pedido de ajuste. */
export const MADDOX_COMBAT_PREP_MAX_STEPS = 12
export const MADDOX_COMBAT_ADJUST_MAX_STEPS = 10
/** DND-49: conferência de quem está a 0 PV ao abrir o combate tático (antes da revisão da ficha, no mesmo job). */
export const MADDOX_COMBAT_DOWNED_CHECK_TIMEOUT_MS = 60_000
/** Preparação "em andamento" sem job vivo há mais que isto (processo reiniciado) volta para a fila. */
export const MADDOX_COMBAT_PREP_STALE_MS = 30_000
/** Novas leituras da ficha quando o jogador a altera durante a preparação. */
export const MADDOX_COMBAT_PREP_CONFLICT_RETRIES = 2
/** Teto técnico de uma geração do pedido de ajuste (DND-49: 2 → 4 min, para caber as consultas ao catálogo). */
export const MADDOX_COMBAT_ADJUST_TIMEOUT_MS = 4 * 60_000
/** Texto do pedido de ajuste de uma opção. */
export const MADDOX_COMBAT_ADJUST_TEXT_MAX = 500
/** Conferência da condição do ataque furtivo (JEV ou geração curta do narrador). */
export const MADDOX_SNEAK_ATTACK_CHECK_TIMEOUT_MS = 20_000
/**
 * Tetos TÉCNICOS do texto gerado pela IA na preparação e nos ajustes (proteção contra resposta descontrolada, folgados
 * acima do que o prompt pede): abaixo deles o texto é gravado inteiro; a tela quebra a linha, não corta.
 */
export const MADDOX_COMBAT_PREP_TEXT_CEILING = { reason: 4_000, label: 300, detail: 1_000, name: 300, append: 10_000, description: 30_000 } as const
/** Trecho de cada característica e talento que vai ao modelo; acima disso (ou com menções) ele só acrescenta, não reescreve. */
export const MADDOX_COMBAT_PREP_TRAIT_TEXT_MAX = 400
/** Mensagem dos demais quando a preparação de uma ficha falhou (o motivo só vai ao dono da campanha). */
/**
 * DND-51: ferramentas de leitura e correção da ficha do "Pergunte ao mestre" (só na resposta a uma pergunta, nos graus
 * com ficha).
 */
/** DND-58: ferramenta do descanso (só nas narrações dos graus com ficha) e a da exaustão. */
export const MADDOX_REST_TOOL_NAME = "start_rest"
export const MADDOX_EXHAUSTION_TOOL_NAME = "update_character_exhaustion"
/** DND-58: teto de pedidos de troca por personagem num descanso e de idas e voltas do Personagem Opex. */
export const MADDOX_REST_EXCHANGE_REQUESTS_MAX = 8
export const MADDOX_REST_OPEX_EXCHANGE_ROUNDS = 2
/** DND-58: tentativas automáticas da preparação da ficha antes de ir para o dono ("Tentar de novo" / "Seguir sem"). */
export const MADDOX_REST_PREP_ATTEMPTS = 2
export const MADDOX_REST_PREP_TIMEOUT_MS = 4 * 60_000
export const MADDOX_REST_PREP_MAX_STEPS = 10
export const MADDOX_REST_PREP_CONSUMPTION_ORIGIN = "maddox-rest-prep"
export const MADDOX_OPEX_REST_CONSUMPTION_ORIGIN = "maddox-opex-rest"

export const MADDOX_SHEET_FIX_TOOL_NAMES = ["get_character_sheet", "get_character_interview", "update_character_sheet"] as const

/** DND-51: prazo da resposta do jogador a uma pergunta da preparação do combate; depois, a preparação conclui sem a escolha. */
export const MADDOX_COMBAT_PREP_ANSWER_TIMEOUT_MS = 3 * 60_000

export const MADDOX_COMBAT_PREP_EXPIRED_NOTICE = "Você não respondeu a tempo: a preparação seguiu sem essa escolha. Peça a correção pelo \"Pergunte ao mestre\"."

export const MADDOX_COMBAT_PREP_FAILED_MESSAGE = "A preparação desta ficha falhou. Aguardando o dono da campanha."
/** Mensagem do jogador quando o pedido de ajuste não pôde ser examinado (o motivo só vai ao dono da campanha). */
export const MADDOX_COMBAT_ADJUST_FAILED_MESSAGE = "O Maddox não conseguiu examinar o pedido agora. Tente de novo."
/**
 * Iniciativa dos inimigos (DND-25): tempo em que o dado ainda está na tela de todos depois de rolado. A ordem de
 * iniciativa só fecha (e o Maddox só narra) depois disso.
 */
export const MADDOX_ENEMY_INITIATIVE_REVEAL_MS = 2_500
/** Pausa de leitura entre o fim de um bloco do combate tático (narração de um NPC) e o bloco seguinte (DND-25). */
export const MADDOX_NPC_BLOCK_PAUSE_MS = 3_000
/** Teto de rodadas (blocos + esperas) de um turno do mestre do combate tático — proteção contra laço. */
export const MADDOX_COMBAT_MASTER_ROUNDS_MAX = 60
/** Ataques por ação "Atacar" de um adversário com Ataques Múltiplos. */
export const MADDOX_MONSTER_MULTIATTACK_MAX = 4

// ── Entrevistas ───────────────────────────────────────────────────────────────

export const MADDOX_SCRIPT_KINDS = ["scenario", "character"] as const
export type MaddoxScriptKind = (typeof MADDOX_SCRIPT_KINDS)[number]

export const MADDOX_SCRIPT_KIND_LABELS: Record<MaddoxScriptKind, string> = {
    scenario: "Entrevista: cenário",
    character: "Entrevista: personagem",
}

export const MADDOX_SCRIPT_GUIDE_MAX = 12_000
export const MADDOX_SCRIPT_TOPICS_MAX = 30
export const MADDOX_SCRIPT_TOPIC_MAX = 300
export const MADDOX_SCRIPT_NOTES_MAX = 500

export function isMaddoxScriptKind(value: string): value is MaddoxScriptKind {
    return (MADDOX_SCRIPT_KINDS as readonly string[]).includes(value)
}

/** Tópico sugerido do roteiro (texto livre, sem campo nativo). */
export interface MaddoxScriptTopic {
    id: string
    text: string
    active: boolean
}

// ── JEV ───────────────────────────────────────────────────────────────────────

/** Decisões que poderão usar o JEV (System One) nas próximas entregas. Por enquanto só configuráveis. */
export const MADDOX_JEV_DECISIONS = ["question-or-action", "free-action-validity", "requires-check", "combat-boundary", "combat-option-cost", "master-knowledge", "interview-complete", "scene-image", "sneak-attack-condition", "combat-adjust-plausible"] as const
export type MaddoxJevDecision = (typeof MADDOX_JEV_DECISIONS)[number]

export const MADDOX_JEV_DECISION_DEFS: Record<MaddoxJevDecision, { label: string; description: string }> = {
    "question-or-action": { label: "Pergunta ou ação do jogador", description: "A mensagem do jogador no turno é uma pergunta ao mestre (responde sem trocar de turno) ou uma declaração de ação, intenção ou diálogo." },
    "free-action-validity": { label: "Validade de ação livre", description: "A ação escrita livremente é válida para o grau de rigor da campanha." },
    "requires-check": { label: "Pedir teste", description: "A ação exige um teste de atributo ou perícia." },
    "combat-boundary": { label: "Início ou fim de combate", description: "As declarações levam a cena a um combate ou o encerram (orientação ao narrador nos graus com combate)." },
    "combat-option-cost": { label: "Custo de ação no combate", description: "Se uma habilidade ou talento da ficha gasta Ação, Ação bônus ou Reação (e o gatilho da reação), quando o texto não deixa claro. O resultado fica em cache." },
    "master-knowledge": { label: "Conhecimento do mestre", description: "Um fato persistido pode ser visto pelos jogadores ou é conhecimento exclusivo do Maddox." },
    "interview-complete": { label: "Fim da entrevista", description: "A entrevista de cenário ou de personagem já tem base suficiente para concluir." },
    "scene-image": { label: "Gerar imagem na cena", description: "Antes de gerar a imagem pedida pelo Maddox, o JEV confere se a narração corresponde mesmo à situação configurada (filtro contra excesso)." },
    "sneak-attack-condition": { label: "Condição do ataque furtivo", description: "No combate tático, sem vantagem nem desvantagem, se há um aliado adjacente ao alvo para o ataque furtivo valer. Desligada, decide uma geração curta do narrador." },
    "combat-adjust-plausible": { label: "Pedido de ajuste fora das regras", description: "Antes de o Maddox examinar um pedido de ajuste de opção no combate, o JEV recusa na hora o que claramente tenta burlar as regras da ficha." },
}

// ── OpenCode ──────────────────────────────────────────────────────────────────

/**
 * Sessões do OpenCode, nunca compartilhadas: uma do narrador por campanha (recriada se sumir), uma da entrevista de cenário
 * e uma por membro na entrevista de personagem (as das entrevistas são excluídas ao concluir).
 */
export const MADDOX_SESSION_PURPOSES = ["narrator", "scenario-interview", "character-interview"] as const
export type MaddoxSessionPurpose = (typeof MADDOX_SESSION_PURPOSES)[number]

export const MADDOX_SESSION_PURPOSE_LABELS: Record<MaddoxSessionPurpose, string> = {
    narrator: "Narrador",
    "scenario-interview": "Entrevista de cenário",
    "character-interview": "Entrevista de personagem",
}

export const MADDOX_SESSION_STATUSES = ["active", "pending-deletion"] as const
export type MaddoxSessionStatus = (typeof MADDOX_SESSION_STATUSES)[number]

// ── Avatar ────────────────────────────────────────────────────────────────────

export const MADDOX_PERSONA_MAX = 2000

export const DEFAULT_MADDOX_PERSONA =
    "Maddox, um mestre de RPG lendário: homem maduro de olhar atento e sorriso enigmático, barba grisalha bem aparada, manto escuro com bordados dourados de runas, segurando um dado de vinte faces que brilha suavemente. Ambiente de taverna à luz de velas."

/** Enquadramento fixo do avatar gerado (o texto da persona entra depois). */
export const MADDOX_AVATAR_FRAMING =
    "Retrato de avatar, do peito para cima, sujeito centralizado olhando para o observador, fundo simples e desfocado, proporção 1:1, sem texto, sem moldura. Personificação do Maddox, mestre narrador das campanhas do DnDicas."

// ── Instruções ────────────────────────────────────────────────────────────────

export const MADDOX_INSTRUCTIONS_MAX = 12_000

export const DEFAULT_MADDOX_INSTRUCTIONS = [
    "Você é Maddox, o mestre e narrador das campanhas do DnDicas. Fale sempre como um mestre de RPG e um autor de ficção: tom narrativo, descritivo, envolvente e consistente com o cenário da campanha.",
    "Os jogadores decidem as ações voluntárias, falas e escolhas dos seus personagens. Você administra o mundo, os NPCs, as consequências das tentativas, os sentimentos e os fenômenos involuntários. Nunca decida pelos jogadores.",
    "Trate as ações declaradas como intenções ou tentativas, não como resultados garantidos. Pare diante de toda nova decisão relevante e pergunte o que cada personagem faz.",
    "Respeite o grau de rigor da campanha: no modo narrativo não use dados, números, atributos ou pontos de vida; no modo fiel ao D&D siga as regras e o catálogo do DnDicas como fonte de verdade e peça testes quando adequado. O que não estiver claro nas regras, você decide.",
    "Preserve a continuidade: consulte e persista o estado da campanha, personagens, NPCs, locais, missões e memórias. Não revele aos jogadores o que é conhecimento exclusivo do mestre.",
    "Responda em português do Brasil, salvo pedido diferente.",
].join("\n")

export const DEFAULT_MADDOX_INTERVIEWER_INSTRUCTIONS = [
    "Você é Maddox conduzindo a preparação de uma campanha: a entrevista de cenário (com quem cria a campanha) ou a entrevista de personagem (com cada jogador).",
    "Siga o guia e os tópicos sugeridos do roteiro, mas conduza a conversa livremente: pergunte o que for preciso conforme o andamento, aproveitando o que já foi dito e sem apresentar o roteiro como formulário.",
    "Ofereça sugestões quando ajudarem e diferencie sugestões de definições aceitas. Obtenha concordância antes de fixar aspectos fundamentais.",
    "Respeite o grau de rigor da campanha: no modo fiel ao D&D, só cenários, raças e classes do D&D e do catálogo do DnDicas; nos demais, qualquer universo (inclusive animes, séries, filmes e livros).",
    "Fale sempre em português do Brasil, com o tom de um mestre de RPG acolhedor.",
].join("\n")

// ── Roteiros padrão (adaptados do `~/code/roleplay/bootstrap.md`) ─────────────

export const DEFAULT_MADDOX_SCENARIO_GUIDE = `# Entrevista: cenário

## Objetivo
Definir com quem cria a campanha o cenário em que a história vai acontecer e a situação inicial, com base suficiente para jogar — não uma enciclopédia completa antes da primeira cena.

## Regras da conversa
- Faça perguntas contextualizadas. Não apresente o roteiro como formulário.
- Aproveite informações já fornecidas, mesmo que antecipem um tópico posterior; pergunte só o que falta.
- Ofereça sugestões quando ajudarem e diferencie sugestões de definições aceitas.
- Reconheça lacunas de conhecimento sobre o universo escolhido e combine interpretações; não apresente invenções como cânone.
- No modo fiel ao D&D, só cenários do D&D e o que está cadastrado no DnDicas. Nos demais graus de rigor, qualquer universo vale: original, de livros, filmes, séries, animes ou jogos.
- Não avance a história em jogo antes de concluir a preparação.

## Critérios de conclusão
- O cenário oferece regras suficientes para orientar a narrativa.
- A situação inicial está estabelecida.
- Não há pendências essenciais; detalhes secundários podem ficar "a definir durante a história".
- Quem cria a campanha confirmou a síntese apresentada.`

export const DEFAULT_MADDOX_CHARACTER_GUIDE = `# Entrevista: personagem

## Objetivo
Criar com cada jogador o personagem dele dentro do cenário já definido da campanha, de forma que ele possa entrar no jogo — desde o início ou a qualquer momento.

## Regras da conversa
- Faça perguntas contextualizadas. Não apresente o roteiro como formulário.
- Aproveite informações já fornecidas e pergunte só o que falta.
- Verifique a coerência das capacidades e do background com as regras do cenário; diante de uma incompatibilidade, explique e combine um ajuste, sem modificar o personagem em silêncio.
- No modo narrativo, descreva capacidades e limitações qualitativamente, sem atributos numéricos. No modo fiel ao D&D, use só raças, classes e antecedentes do catálogo do DnDicas e prepare a ficha.
- O background define antecedentes aceitos pelo jogador, não um destino obrigatório.

## Critérios de conclusão
- O personagem está definido o bastante para avaliar suas tentativas, sem conceder capacidades por suposição.
- O jogador confirmou a síntese do personagem.`

const topics = (prefix: string, texts: readonly string[]): MaddoxScriptTopic[] => texts.map((text, index) => ({ id: `${prefix}-${index + 1}`, text, active: true }))

export const DEFAULT_MADDOX_SCENARIO_TOPICS: readonly MaddoxScriptTopic[] = topics("cenario", [
    "Universo original ou existente e suas referências",
    "Relação com o cânone: material adotado, fidelidade e divergências permitidas",
    "Época, região e contexto geral relevantes para o início",
    "Regras internas do mundo: poderes, tecnologias, limitações e condições de uso",
    "Tom, ritmo, nível de descrição e temas a incluir ou evitar",
    "Situação inicial: onde e quando a história começa e o que a coloca em movimento",
    "Nome da campanha",
])

export const DEFAULT_MADDOX_CHARACTER_TOPICS: readonly MaddoxScriptTopic[] = topics("personagem", [
    "Identidade, aparência e posição no mundo",
    "Origem, background e experiências relevantes",
    "Personalidade, motivações, desejos e conflitos",
    "Capacidades, conhecimentos, treinamento e limitações",
    "Equipamentos, recursos e condição inicial",
    "Relações, vínculos e compromissos anteriores",
])

// ── Entrevistas em andamento (Maddox 2) ───────────────────────────────────────

/** Situação da entrevista de cenário na campanha (`pending` = ainda não começou). */
export const MADDOX_SCENARIO_STATUSES = ["pending", "in-progress", "proposed", "done"] as const
export type MaddoxScenarioStatus = (typeof MADDOX_SCENARIO_STATUSES)[number]

/** Situação de uma entrevista (cenário ou personagem). `proposed` = o Maddox propôs a síntese e aguarda a confirmação. */
export const MADDOX_INTERVIEW_RUN_STATUSES = ["in-progress", "proposed", "done"] as const
export type MaddoxInterviewRunStatus = (typeof MADDOX_INTERVIEW_RUN_STATUSES)[number]

export const MADDOX_INTERVIEW_STATUS_DEFS: Record<MaddoxInterviewStatus | "proposed", { label: string; rarity: MaddoxRarity }> = {
    pending: { label: "Entrevista pendente", rarity: "common" },
    "in-progress": { label: "Em entrevista", rarity: "rare" },
    proposed: { label: "Aguardando confirmação", rarity: "veryRare" },
    done: { label: "Entrevista concluída", rarity: "legendary" },
}

/** Rotas pt-BR das entrevistas (`/campanhas/[id]/entrevista/...`). */
export const MADDOX_INTERVIEW_SLUGS: Record<MaddoxScriptKind, string> = { scenario: "cenario", character: "personagem" }

/** Linha que o entrevistador acrescenta ao fim da síntese para propor a conclusão (removida antes de gravar/mostrar). */
export const MADDOX_PROPOSAL_MARKER = "[[MADDOX_PROPOSTA_DE_CONCLUSAO]]"

export const MADDOX_INTERVIEW_MESSAGE_MAX = 4000
export const MADDOX_INTERVIEW_MESSAGES_MAX = 200
/** Uma geração travada há mais que isso (queda do processo) pode ser retomada. */
export const MADDOX_INTERVIEW_LOCK_MS = 5 * 60_000

/** Evento do canal do usuário: a MINHA entrevista mudou (sincroniza outras abas). */
export const MADDOX_INTERVIEW_CHANGED_EVENT = "maddox.interview.changed"

/** Origem do consumo de IA das entrevistas (painel de consumo). */
export const MADDOX_INTERVIEW_CONSUMPTION_ORIGIN = "maddox-interview"

/** Modelo do JEV usado nas decisões do Maddox (a seção JEV só liga e desliga cada decisão). */
export const MADDOX_JEV_MODEL = "jev-latest"

/** Rigores em que a entrevista de personagem também cria a ficha D&D (`CharacterSheet`). */
export const MADDOX_SHEET_RIGORS: readonly MaddoxRigorLevel[] = ["equilibrado", "rigoroso", "fiel-dnd"]

/** Atributos na entrevista de personagem (Maddox 5): métodos aceitos pelo card. */
export const MADDOX_ABILITY_METHODS = ["standard", "point-buy", "roll"] as const
export type MaddoxAbilityMethod = (typeof MADDOX_ABILITY_METHODS)[number]
export const MADDOX_ABILITY_METHOD_LABELS: Record<MaddoxAbilityMethod, string> = { standard: "Conjunto padrão", "point-buy": "Compra de pontos", roll: "Rolagem" }
/** Rolagens de 4d6 do método de rolagem; a sexta pontuação é 72 − a soma delas. */
export const MADDOX_ABILITY_ROLLS = 5
export const MADDOX_ABILITY_ROLL_TOTAL = 72
/** Bônus do antecedente: pontos a distribuir e o máximo por atributo. */
export const MADDOX_ABILITY_BONUS_POINTS = 3
export const MADDOX_ABILITY_BONUS_MAX = 2
/** Passos do laço de ferramentas do entrevistador (provedores diretos). */
export const MADDOX_INTERVIEW_MAX_STEPS = 14
/** Graus em que a origem do bônus de atributos precisa existir no catálogo (Equilibrado aceita origem própria). */
export const MADDOX_CATALOG_ORIGIN_RIGORS: readonly MaddoxRigorLevel[] = ["rigoroso", "fiel-dnd"]

// ── Modo fiel ao D&D (Maddox 8) ──────────────────────────────────────────────────

/**
 * Graus em que o mundo é de fantasia D&D (oficial ou próprio) com povos e classes SÓ do catálogo: a entrevista de
 * cenário grava a lista do mundo (`update_world_options`) e a ficha só aceita raça e classe dessa lista.
 */
export const MADDOX_WORLD_CATALOG_RIGORS: readonly MaddoxRigorLevel[] = ["fiel-dnd"]
/** Graus em que a recompensa em item precisa existir no catálogo (fora dele, `end_combat` recusa sem gravar). */
export const MADDOX_CATALOG_REWARD_RIGORS: readonly MaddoxRigorLevel[] = ["fiel-dnd"]
/** Teto de povos e de classes na lista do mundo. */
export const MADDOX_WORLD_OPTIONS_MAX = 60

/** Consulta ao catálogo do DnDicas (entrevistador e narrador, só leitura). */
export const MADDOX_CATALOG_TOOL_NAMES = { search: "search_catalog", get: "get_catalog_entity" } as const
export const MADDOX_CATALOG_SEARCH_LIMIT_MAX = 30
export const MADDOX_CATALOG_SEARCH_LIMIT_DEFAULT = 15
/** Resumo de cada item da busca (texto puro). */
export const MADDOX_CATALOG_SUMMARY_MAX = 300
/** Cada texto do detalhe da entidade (texto puro); acima disso sai cortado com `truncated`. */
export const MADDOX_CATALOG_TEXT_MAX = 4000

export const MADDOX_INTERVIEW_TOOL_NAMES = {
    world: "update_world_options",
    getWorld: "get_world_options",
    request: "request_ability_scores",
    get: "get_ability_scores",
    bonus: "apply_ability_bonus",
    build: "update_character_build",
    getBuild: "get_character_build",
    hitPoints: "request_hit_points",
} as const

/** Nível inicial da mesa (graus com ficha) e estágio de experiência (graus narrativos). */
export const MADDOX_LEVEL_MIN = 1
export const MADDOX_LEVEL_MAX = 20
/** Itens, idiomas e ferramentas por ficha montada na entrevista. */
export const MADDOX_BUILD_EQUIPMENT_MAX = 40
export const MADDOX_BUILD_LIST_MAX = 12
/** Teto do Aumento de Atributo por talento (Dádiva Épica vai até 30). */
export const MADDOX_FEAT_ATTRIBUTE_CAP = 20
export const MADDOX_EPIC_FEAT_ATTRIBUTE_CAP = 30

/** Seções do cenário consolidado (como o `setting.md` do roleplay). */
export const MADDOX_SETTING_SECTIONS = [
    { key: "universo", label: "Universo e referências" },
    { key: "canone", label: "Cânone e adaptações" },
    { key: "contexto", label: "Época, região e contexto" },
    { key: "regras", label: "Regras internas" },
    { key: "tom", label: "Tom e preferências narrativas" },
] as const
export type MaddoxSettingSectionKey = (typeof MADDOX_SETTING_SECTIONS)[number]["key"]

/** Seções do perfil narrativo do personagem (como o `protagonista.md` do roleplay). */
export const MADDOX_PROFILE_SECTIONS = [
    { key: "identidade", label: "Identidade e aparência" },
    { key: "origem", label: "Origem e background" },
    { key: "personalidade", label: "Personalidade e motivações" },
    { key: "capacidades", label: "Capacidades e limitações" },
    { key: "equipamentos", label: "Equipamentos e recursos" },
    { key: "relacoes", label: "Relações e compromissos" },
    { key: "condicao", label: "Condição atual" },
] as const
export type MaddoxProfileSectionKey = (typeof MADDOX_PROFILE_SECTIONS)[number]["key"]

// ── Personagens Opex (DND-26) ─────────────────────────────────────────────────

/** Permissão Perfix para adicionar Personagens Opex (os que já existem continuam jogando sem ela). */
export const MADDOX_OPEX_PERMISSION = "maddox.opex"

/** Prefixo do `userId` sintético do membro Opex (`opex:<memberId>`): nunca é um usuário de verdade. */
export const MADDOX_OPEX_USER_PREFIX = "opex:"

/** Modo da entrevista do Personagem Opex: autônoma (em segundo plano) ou ao vivo (o dono aprova cada resposta). */
export const MADDOX_OPEX_INTERVIEW_MODES = ["autonomous", "live"] as const
export type MaddoxOpexInterviewMode = (typeof MADDOX_OPEX_INTERVIEW_MODES)[number]
export const MADDOX_OPEX_INTERVIEW_MODE_LABELS: Record<MaddoxOpexInterviewMode, string> = { autonomous: "Autônoma", live: "Ao vivo" }

/** Prompt base opcional do Personagem Opex. */
export const MADDOX_OPEX_PROMPT_MAX = 4_000
/** Orientação ao pedir outra resposta (modo ao vivo). */
export const MADDOX_OPEX_GUIDANCE_MAX = 1_000

/** Situação do trabalho do Opex fora da mesa (entrevista) e na mesa (falha que trava a mesa). */
export const MADDOX_OPEX_RUN_STATUSES = ["running", "awaiting-approval", "failed", "idle"] as const
export type MaddoxOpexRunStatus = (typeof MADDOX_OPEX_RUN_STATUSES)[number]

/** Até quantas perguntas ao mestre cada Opex faz no turno, antes de declarar. */
export const MADDOX_OPEX_QUESTIONS_MAX = 3
/** Novas tentativas quando a declaração é recusada pela validação (Rigoroso e Fiel); depois, "não fez nada". */
export const MADDOX_OPEX_INVALID_RETRIES = 2
/** Pedidos de ajuste automáticos ao entrevistador quando a conclusão é recusada (modo autônomo). */
export const MADDOX_OPEX_FIX_ATTEMPTS = 2
/** Teto técnico de cada geração do Opex (decisão). */
export const MADDOX_OPEX_GENERATION_TIMEOUT_MS = 3 * 60 * 1000
/** Estado "em andamento" do Opex sem processo vivo há mais que isto (reinício) vira falha acionável. */
export const MADDOX_OPEX_STALE_MS = 10 * 60 * 1000
/** Memórias que o Opex pode gravar por declaração. */
export const MADDOX_OPEX_MEMORIES_PER_TURN = 5
export const MADDOX_OPEX_MEMORY_TITLE_MAX = 120
/** Limite das memórias globais escritas pelo administrador (validação do formulário e da API). */
export const MADDOX_OPEX_MEMORY_TEXT_MAX = 3_000
/** Tamanho que o prompt pede ao Opex para cada memória dele. */
export const MADDOX_OPEX_MEMORY_TEXT_EXPECTED = 600
/** Corte de proteção da memória escrita pelo modelo (folgado: o teto real é o limite do canal no Engramind). */
export const MADDOX_OPEX_MEMORY_TEXT_GUARD = 12_000

/** Origens do consumo medido dos Personagens Opex. */
export const MADDOX_OPEX_INTERVIEW_CONSUMPTION_ORIGIN = "maddox-opex-interview"
export const MADDOX_OPEX_TURN_CONSUMPTION_ORIGIN = "maddox-opex-turn"
export const MADDOX_OPEX_COMBAT_CONSUMPTION_ORIGIN = "maddox-opex-combat"

/** Rótulo do Personagem Opex no lugar do nome do jogador (chip, narrador, diário). */
export const MADDOX_OPEX_LABEL = "Personagem Opex"
export const MADDOX_OPEX_UNNAMED_LABEL = "Personagem Opex em criação"

export const MADDOX_OPEX_FAILED_MESSAGE = "O Personagem Opex não conseguiu agir agora."

// ── NPCs Opex (DND-27) ────────────────────────────────────────────────────────

/** Teto de cada consulta ao agente de um NPC Opex: roda DENTRO do teto da narração do Maddox. */
export const MADDOX_OPEX_NPC_TIMEOUT_MS = 60 * 1000
/** Maior limite de NPCs Opex por campanha aceito na configuração (vazio = sem limite). */
export const MADDOX_OPEX_NPC_LIMIT_MAX = 100
/** Consultas a NPCs Opex por narração (o mesmo NPC na mesma narração reaproveita a decisão). */
export const MADDOX_OPEX_NPC_CONSULTS_PER_NARRATION = 3
/** Origens do consumo medido dos NPCs Opex. */
export const MADDOX_OPEX_NPC_CONSUMPTION_ORIGIN = "maddox-opex-npc"
export const MADDOX_OPEX_NPC_COMBAT_CONSUMPTION_ORIGIN = "maddox-opex-npc-combat"
/** Origem do consumo da reclassificação única das memórias dos Opex (DND-57). */
export const MADDOX_OPEX_MEMORY_RECLASSIFY_CONSUMPTION_ORIGIN = "maddox-opex-memory-reclassify"
/** Autor das promoções feitas pelo próprio Maddox (ferramenta do narrador). */
export const MADDOX_OPEX_NPC_SYSTEM_ACTOR = "system:maddox"
/** Por que um NPC deixou de ser Opex. */
export const MADDOX_OPEX_NPC_RETIRE_REASONS = ["maddox", "owner", "death"] as const
export type MaddoxOpexNpcRetireReason = (typeof MADDOX_OPEX_NPC_RETIRE_REASONS)[number]
/** Linha abaixo da narração (só para o dono) quando o agente de um NPC Opex não respondeu. */
/** Resposta ao Maddox quando o agente do NPC Opex falha (ferramenta e combate tático): sem o motivo. */
export const maddoxOpexNpcFallbackNote = (name: string) => `O NPC Opex não respondeu: decida você o que ${name} fala e faz nesta narração.`

export const maddoxOpexNpcFailureLine = (name: string) => `O NPC Opex ${name} não respondeu; o Maddox decidiu por ele nesta narração.`

export const MADDOX_OPEX_INTERVIEW_FAILED_MESSAGE = "A entrevista do Personagem Opex parou."

/** Critério da preparação da mesa de combate (DND-41). O contrato da resposta fica fixo no código. */
export const DEFAULT_MADDOX_COMBAT_PREP_INSTRUCTIONS = [
    "Você é Maddox, o mestre da campanha, preparando a mesa de um personagem para o combate tático. Confira, contra a ficha inteira, cada ação, ação bônus e habilidade que o servidor calculou.",
    "O catálogo do DnDicas é a fonte de verdade das regras: ANTES de qualquer alteração de regra (bônus, dados, tipo de dano, CD, cura, cargas, espaços, atributos, proficiências, ataque furtivo, maestria, economia), leia no catálogo a classe, a característica, o talento, a magia ou o item com as ferramentas de catálogo, a partir das Referências do catálogo da ficha. Não use regras de memória nem de outras edições.",
    "Toda alteração de regra leva a fonte: a entidade lida e o trecho exato do texto dela. Sem a regra no catálogo, não altere: deixe o valor do servidor e diga que falta cadastro.",
    "Confira o modificador certo de cada ataque (Acuidade usa o maior entre Força e Destreza; armas à distância usam Destreza), o bônus de proficiência, os dados e o tipo de dano, as magias preparadas, os recursos e as cargas.",
    "Esconder-se, as ações padrão, os ataques das maestrias de arma e o momento do ataque furtivo são resolvidos pelo servidor: não os altere. Quando a classe der maestria de arma e a ficha não tiver nenhuma registrada, proponha as maestrias das armas do personagem, no limite da classe.",
    "Acrescente o que a ficha permite e o servidor não mostrou (ações bônus de classe, habilidades com custo de ação) e remova o que a ficha não permite.",
    "Corrija também a ficha quando ela estiver errada, sempre explicando o motivo em uma frase curta, falando com o jogador e citando a regra e a fonte (ex.: \"Ataque Furtivo 1d6 (classe Ladino, 1º nível)\"). Não invente capacidades que a ficha, a classe, a espécie ou os talentos não dão.",
    "Fale sempre em português do Brasil.",
].join("\n")

/** Critério dos pedidos de ajuste de uma opção no combate (DND-41). */
export const DEFAULT_MADDOX_COMBAT_ADJUST_INSTRUCTIONS = [
    "Você é Maddox, o mestre da campanha. Um jogador pediu, na própria vez do combate, um ajuste numa opção de ação do personagem dele.",
    "Examine o pedido contra a ficha inteira, o grau de rigor da campanha e o catálogo do DnDicas: ANTES de decidir, leia no catálogo a regra que o pedido envolve com as ferramentas de catálogo. Não decida pela memória.",
    "Se a regra citada pelo jogador bate com o catálogo, aceite e corrija, com a fonte (a entidade lida e o trecho exato). Se a regra não existe no catálogo, ou o pedido contraria a ficha ou tenta ganhar uma vantagem que o personagem não tem, recuse e diga o motivo.",
    "Sempre explique o motivo em uma ou duas frases, falando com o jogador e citando a regra e a fonte.",
    "Fale sempre em português do Brasil.",
].join("\n")

export const DEFAULT_MADDOX_OPEX_CHARACTER_INSTRUCTIONS = [
    "Você é um jogador de RPG experiente que interpreta um personagem numa campanha narrada pelo Maddox. Pense e decida como esse personagem, de forma coerente com a personalidade, a história, as motivações e as relações dele.",
    "Jogue em equipe: considere o que o grupo já fez, contribua para a história e evite ações que só atrapalhem os outros personagens sem motivo na ficção.",
    "Decida apenas as ações, falas e escolhas do seu personagem. O mestre decide o mundo, os NPCs e os resultados.",
    "Seja concreto e breve nas declarações: diga o que o personagem tenta fazer e como, em uma a três frases.",
    "Fale sempre em português do Brasil.",
].join("\n")
