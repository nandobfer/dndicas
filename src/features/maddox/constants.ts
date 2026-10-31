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
        rules: ["Ficha completa do D&D", "Testes, iniciativa, ação e ação bônus exatamente como nas regras", "Só raças, classes, magias e itens cadastrados no DnDicas", "Ação livre só vale se as regras permitirem"],
        free: ["Somente o que as regras não cobrem, decidido pelo mestre"],
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

export const MADDOX_CAMPAIGN_AUDIT_ENTITY = "CampanhaMaddox"
export const MADDOX_CAMPAIGN_NAME_MIN = 3
export const MADDOX_CAMPAIGN_NAME_MAX = 80
export const MADDOX_CHARACTER_NAME_MIN = 2
export const MADDOX_CHARACTER_NAME_MAX = 60

/** Evento do canal do usuário (`private-maddox-u-{userId}`): algo mudou numa campanha da qual ele participa. */
export const MADDOX_CAMPAIGN_CHANGED_EVENT = "maddox.campaign.changed"

export const MADDOX_MEMBER_ROLES = ["owner", "player"] as const
export type MaddoxMemberRole = (typeof MADDOX_MEMBER_ROLES)[number]

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

export const MADDOX_TURN_PHASES = ["master", "players"] as const
export type MaddoxTurnPhase = (typeof MADDOX_TURN_PHASES)[number]

// ── Mesa e turnos (Maddox 3) ──────────────────────────────────────────────────

/** Evento do canal do usuário: a mesa (turno ou mensagens) de uma campanha mudou. */
export const MADDOX_GAME_CHANGED_EVENT = "maddox.game.changed"

/**
 * Mensagens da mesa: narração do mestre, declaração do jogador, "não fazer nada" (`pass`), pergunta ao
 * mestre (não encerra o turno) e a resposta dele.
 */
export const MADDOX_GAME_MESSAGE_KINDS = ["narration", "declaration", "pass", "question", "answer"] as const
export type MaddoxGameMessageKind = (typeof MADDOX_GAME_MESSAGE_KINDS)[number]

/** O que o jogador envia no próprio turno. */
export const MADDOX_GAME_ACTION_KINDS = ["declaration", "pass", "question"] as const
export type MaddoxGameActionKind = (typeof MADDOX_GAME_ACTION_KINDS)[number]

export const MADDOX_GAME_MESSAGE_MAX = 4_000
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
export const MADDOX_NARRATOR_MAX_STEPS = 12
/** Transcrição recente enviada ao narrador (o estado gravado cobre o que fica de fora). */
export const MADDOX_NARRATOR_HISTORY_CHARS = 40_000
/** Itens de cada lista no índice do estado entregue ao narrador. */
export const MADDOX_NARRATOR_INDEX_ITEMS = 40

/** Origens do consumo de IA do narrador (painel de consumo). */
export const MADDOX_NARRATION_CONSUMPTION_ORIGIN = "maddox-narration"
export const MADDOX_VALIDATION_CONSUMPTION_ORIGIN = "maddox-validation"

/** Servidor MCP do Maddox registrado no OpenCode (ferramentas do narrador quando o provedor é o OpenCode). */
export const MADDOX_MCP_SERVER_NAME = "dndicas-maddox"
export const MADDOX_MCP_PATH = "/api/maddox/mcp"
/** Validade do token de turno que o OpenCode envia às ferramentas do MCP. */
export const MADDOX_TURN_TOKEN_TTL_MS = 20 * 60 * 1000

/** Resposta gravada quando a geração da resposta a uma pergunta falha. */
export const MADDOX_ANSWER_FAILED_MESSAGE = "O Maddox não conseguiu responder agora. Pergunte de novo."

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
export const MADDOX_JEV_DECISIONS = ["question-or-action", "free-action-validity", "requires-check", "combat-boundary", "master-knowledge", "interview-complete", "scene-image"] as const
export type MaddoxJevDecision = (typeof MADDOX_JEV_DECISIONS)[number]

export const MADDOX_JEV_DECISION_DEFS: Record<MaddoxJevDecision, { label: string; description: string }> = {
    "question-or-action": { label: "Pergunta ou ação do jogador", description: "A mensagem do jogador no turno é uma pergunta ao mestre (responde sem trocar de turno) ou uma declaração de ação, intenção ou diálogo." },
    "free-action-validity": { label: "Validade de ação livre", description: "A ação escrita livremente é válida para o grau de rigor da campanha." },
    "requires-check": { label: "Pedir teste", description: "A ação exige um teste de atributo ou perícia." },
    "combat-boundary": { label: "Início ou fim de combate", description: "A cena entrou ou saiu de combate." },
    "master-knowledge": { label: "Conhecimento do mestre", description: "Um fato persistido pode ser visto pelos jogadores ou é conhecimento exclusivo do Maddox." },
    "interview-complete": { label: "Fim da entrevista", description: "A entrevista de cenário ou de personagem já tem base suficiente para concluir." },
    "scene-image": { label: "Gerar imagem na cena", description: "A situação é uma das configuradas para gerar imagem na narração." },
}

// ── OpenCode ──────────────────────────────────────────────────────────────────

/** Sessões do OpenCode: uma por campanha (narrador) ou também uma por entrevista. A entrevista de personagem tem sempre sessão própria por membro. */
export const MADDOX_SESSION_SCOPES = ["campaign", "campaign-and-interviews"] as const
export type MaddoxSessionScope = (typeof MADDOX_SESSION_SCOPES)[number]

export const MADDOX_SESSION_SCOPE_LABELS: Record<MaddoxSessionScope, string> = {
    campaign: "Uma sessão por campanha",
    "campaign-and-interviews": "Uma por campanha e uma por entrevista",
}

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
    "Siga o guia e os tópicos sugeridos do roteiro, mas conduza a conversa livremente: pergunte o que for preciso conforme o andamento, em grupos pequenos de uma a três perguntas, aproveitando o que já foi dito e sem apresentar o roteiro como formulário.",
    "Ofereça sugestões quando ajudarem e diferencie sugestões de definições aceitas. Obtenha concordância antes de fixar aspectos fundamentais.",
    "Respeite o grau de rigor da campanha: no modo fiel ao D&D, só cenários, raças e classes do D&D e do catálogo do DnDicas; nos demais, qualquer universo (inclusive animes, séries, filmes e livros).",
    "Fale sempre em português do Brasil, com o tom de um mestre de RPG acolhedor.",
].join("\n")

// ── Roteiros padrão (adaptados do `~/code/roleplay/bootstrap.md`) ─────────────

export const DEFAULT_MADDOX_SCENARIO_GUIDE = `# Entrevista: cenário

## Objetivo
Definir com quem cria a campanha o cenário em que a história vai acontecer e a situação inicial, com base suficiente para jogar — não uma enciclopédia completa antes da primeira cena.

## Regras da conversa
- Faça perguntas em grupos pequenos e contextualizados (normalmente de uma a três por vez). Não apresente o roteiro como formulário.
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
- Faça perguntas em grupos pequenos e contextualizados (normalmente de uma a três por vez). Não apresente o roteiro como formulário.
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
