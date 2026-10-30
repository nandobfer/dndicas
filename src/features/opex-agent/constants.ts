/** Constantes do "Agente Opex" (módulo puro: tela e servidor). */

/** Configuração salva em `ai_feature_settings` (`feature: "opex-agent"`). */
export const OPEX_FEATURE = "opex-agent"

/** Aba de `/integracoes/ia` com a configuração do agente. */
export const OPEX_AI_TAB = "agente-opex" as const

/** Provedores do agente: só os que aceitam ferramentas definidas pelo app (o OpenCode não aceita). */
export const OPEX_PROVIDER_IDS = ["gemini", "anthropic", "openai", "deepseek"] as const
export type OpexProviderId = (typeof OPEX_PROVIDER_IDS)[number]

export function isOpexProviderId(value: string): value is OpexProviderId {
    return (OPEX_PROVIDER_IDS as readonly string[]).includes(value)
}

/**
 * Grupos de ferramentas (módulos da árvore da configuração). A configuração guarda as ferramentas
 * **desligadas** (ferramenta nova nasce ligada) e o ajuste de confirmação por ferramenta. O papel do
 * turno (visitante, usuário ou administrador) limita ainda mais o catálogo no servidor (`minRole`).
 */
export const OPEX_TOOL_GROUPS = [
    "context",
    "docs",
    "catalog",
    "characters",
    "catalog-admin",
    "files",
    "jobs",
    "memories",
    "integrations",
    "routines",
    "ai-settings",
] as const
export type OpexToolGroup = (typeof OPEX_TOOL_GROUPS)[number]

export const OPEX_TOOL_GROUP_LABELS: Record<OpexToolGroup, { label: string; description: string }> = {
    context: { label: "Contexto", description: "Visão geral do DnDicas, data/hora atual e quem está conversando" },
    docs: { label: "Documentação do DnDicas", description: "Ler e buscar a documentação viva do app (aicontext): módulos, regras e funcionamento" },
    catalog: { label: "Catálogo", description: "Buscar e ler magias, classes, subclasses, raças, origens, talentos, habilidades, itens, monstros e regras" },
    characters: { label: "Fichas e NPCs", description: "Fichas de personagem e NPCs do próprio usuário: ler, criar e editar (usuários logados)" },
    "catalog-admin": { label: "Catálogo (administração)", description: "Criar, editar e excluir entidades do catálogo (só administradores)" },
    files: { label: "Arquivos do chat", description: "Ler os arquivos enviados no chat (usuários logados)" },
    jobs: { label: "Jobs agendados", description: "Agendar prompts para o próprio agente executar sozinho (agora, daqui a um tempo ou numa data e hora), listar, editar e cancelar (usuários logados)" },
    memories: { label: "Memórias dos agentes", description: "Listar, ler, criar, editar e excluir as memórias (instruções permanentes) dos agentes do DnDicas (só administradores)" },
    integrations: { label: "Integrações", description: "Ler (sem segredos), configurar e testar integrações (só administradores)" },
    routines: { label: "Rotinas", description: "Crons do agendador interno (só administradores)" },
    "ai-settings": { label: "Agentes de IA", description: "Configuração dos agentes de IA do DnDicas (Gerador de imagens, Entender com IA, Importador 5etools, Resumo de memórias) (só administradores)" },
}

/** Papel mínimo de cada grupo (o servidor também confere por ferramenta). Sem papel: vale para visitantes. */
export const OPEX_GROUP_MIN_ROLE: Partial<Record<OpexToolGroup, "user" | "admin">> = {
    characters: "user",
    files: "user",
    jobs: "user",
    "catalog-admin": "admin",
    memories: "admin",
    integrations: "admin",
    routines: "admin",
    "ai-settings": "admin",
}

/** Eventos no canal do dono da sessão (`private-opex-{u|a}-{id}`). Payload: `{ id }` (sessão). */
export const OPEX_SESSION_UPDATED_EVENT = "opex-session-updated"
export const OPEX_SESSION_DELETED_EVENT = "opex-session-deleted"

export const OPEX_AUDIT_ENTITY = "AgenteOpex"
/** Origens do painel de consumo de IA (o subject é a sessão). */
export const OPEX_CONSUMPTION_ORIGIN = "opex-agent"
export const OPEX_TITLE_CONSUMPTION_ORIGIN = "opex-title"
export const OPEX_ANONYMOUS_CONSUMPTION_ORIGIN = "opex-anonymous-agent"

/** Visitantes anônimos: limites padrão (configuráveis na aba do agente). */
export const OPEX_ANONYMOUS_TURNS_PER_HOUR_DEFAULT = 20
export const OPEX_ANONYMOUS_TURNS_PER_HOUR_MAX = 500
/** Teto de mensagens por hora somando todos os visitantes (independe de cookie e IP). */
export const OPEX_ANONYMOUS_TOTAL_TURNS_PER_HOUR_DEFAULT = 200
export const OPEX_ANONYMOUS_TOTAL_TURNS_PER_HOUR_MAX = 10_000
export const OPEX_ANONYMOUS_SESSION_TTL_DAYS_DEFAULT = 7
export const OPEX_ANONYMOUS_SESSION_TTL_DAYS_MAX = 90

export const OPEX_TITLE_MAX = 60
export const OPEX_SUMMARY_MAX = 280
export const OPEX_MESSAGE_MAX = 20_000
export const OPEX_DEFAULT_TITLE = "Nova sessão"

export const DEFAULT_OPEX_INSTRUCTIONS = [
    "Você é o Agente Opex, o assistente do DnDicas (Dungeons & Dicas): o compêndio de Dungeons & Dragons 5e em português do Brasil, com magias, classes, subclasses, raças, origens, talentos, habilidades, itens, monstros, regras, fichas de personagem e NPCs, além da integração com o Owlbear Rodeo.",
    "Você responde dúvidas de regras e do catálogo e executa o que o usuário pede usando as ferramentas do app. Use quantas ferramentas forem necessárias: consulte antes de responder, encadeie chamadas e confira o resultado.",
    "Para perguntas sobre entidades (\"o que faz Bola de Fogo?\", \"quais magias de 1º círculo do mago?\"), busque no catálogo (search_catalog, list_entities) e leia a entidade (get_entity) antes de responder. Nunca invente regras, números ou ids: tudo vem das ferramentas.",
    "Para perguntas sobre o próprio DnDicas (como usar uma tela, como funciona um módulo), consulte a documentação do app (search_app_docs, read_app_doc).",
    "Ao citar uma entidade do catálogo retornada pelas ferramentas, use a menção no formato <span data-type=\"mention\" data-id=\"ID\" data-label=\"Nome\" data-entity-type=\"Tipo\">Nome</span>: ela aparece como badge clicável.",
    "As ferramentas já limitam tudo ao papel de quem conversa (visitante, usuário ou administrador): fichas e NPCs são só os do próprio usuário. Nunca tente acessar dados de outros usuários.",
    "Você segue memórias: instruções permanentes cadastradas pelos administradores. Administradores podem pedir para listar, criar, editar e excluir memórias de qualquer agente do DnDicas; a mudança vale a partir da próxima resposta.",
    "Quando uma ferramenta responder `confirmation_required`, a ação aguarda o usuário clicar em Confirmar ou Cancelar no chat: diga em uma frase o que será feito e encerre a resposta. Você receberá a decisão e o resultado na próxima mensagem.",
    "O usuário logado pode enviar arquivos no chat (cada um aparece com o id `fileId`). Imagens, PDFs e textos chegam a você quando o modelo lê o tipo; os demais vêm só como referência.",
    'Para fazer algo mais tarde ("me lembre da sessão às 19h"), agende um job (schedule_job), se o usuário estiver logado: no horário você recebe o prompt sozinho e executa. Escreva o prompt completo e autossuficiente.',
    "Credenciais de integrações podem ser gravadas por administradores, mas nunca são lidas: as ferramentas só informam se um segredo está definido.",
    "Responda em português do Brasil, em Markdown, de forma objetiva, usando a terminologia oficial do Livro do Jogador (2024). Use listas e tabelas curtas quando ajudarem.",
].join("\n")

export const DEFAULT_OPEX_TITLE_INSTRUCTIONS = [
    "Você mantém o título e o resumo de uma sessão de chat entre um usuário e um assistente.",
    `Título: até ${OPEX_TITLE_MAX} caracteres, sem aspas nem ponto final, que identifique o assunto principal da sessão.`,
    `Resumo: até ${OPEX_SUMMARY_MAX} caracteres, em uma ou duas frases, com o que foi pedido, o que foi feito e o que está pendente.`,
    "Atualize os dois com base no título e resumo atuais e no último turno: mantenha o que continua válido e incorpore o que mudou.",
    "Escreva em português do Brasil.",
    'Responda APENAS com JSON: {"title": "...", "summary": "..."}',
].join("\n")

/** Sugestões do estado vazio do chat. */
export const OPEX_SUGGESTIONS = [
    "Como funciona a magia Bola de Fogo?",
    "Quais subclasses do Ladino existem?",
    "Monte um resumo das minhas fichas",
    "Como uso o DnDicas no Owlbear Rodeo?",
] as const

/** Arquivos do chat: limites padrão (configuráveis) e tetos. */
export const OPEX_FILES_PER_MESSAGE_DEFAULT = 10
export const OPEX_FILES_PER_MESSAGE_MAX = 50
export const OPEX_FILE_SIZE_MB_DEFAULT = 20
export const OPEX_FILE_SIZE_MB_MAX = 100
/** Arquivo enviado e não usado numa mensagem é removido (S3 + metadado) pela rotina depois disso. */
export const OPEX_FILE_PENDING_TTL_MS = 24 * 60 * 60 * 1000
/** Validade da URL assinada do PUT direto no storage. */
export const OPEX_FILE_UPLOAD_URL_TTL_SECONDS = 15 * 60
/** Texto de arquivo enviado ao modelo por turno (o resto fica para read_chat_file). */
export const OPEX_FILE_TEXT_INLINE_MAX = 100_000
/** Maior arquivo baixado do storage para ir como conteúdo ao modelo; acima disso vira só referência. */
export const OPEX_FILE_CONTENT_MAX_BYTES = 20 * 1024 * 1024
/** Maior arquivo de texto lido do storage para `read_chat_file` e para o texto inline. */
export const OPEX_FILE_TEXT_MAX_BYTES = 5 * 1024 * 1024

/** Chave das abas abertas no navegador. */
export const OPEX_TABS_STORAGE_KEY = "dndicas:opex-agent:tabs:v1"

/** Atalho global: Ctrl+Shift+O (⌘+Shift+O no Mac). */
export function isOpexShortcut(event: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey">): boolean {
    return (event.ctrlKey || event.metaKey) && event.shiftKey && !event.altKey && event.key.toLowerCase() === "o"
}
