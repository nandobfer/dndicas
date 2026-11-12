/**
 * O mestre da mesa. Desde o Maddox 4 é o narrador com IA (`./narrator`): narra o turno do mestre e responde
 * perguntas, transmitindo o texto ao vivo pelo `sink` e gravando o estado da campanha pelas ferramentas.
 */

export interface MaddoxMasterDeclaration {
    characterName: string
    kind: "declaration" | "pass"
    content: string
    skipped: boolean
    /** JEV "Pedir teste" (Maddox 5): a ação provavelmente exige teste. */
    checkHint?: boolean
}

/** Recebe a geração ao vivo: texto (já sem marcação crua do catálogo) e o uso de ferramentas. */
export interface MaddoxMasterSink {
    delta(text: string): void
    tool(running: boolean): void
    /** Troca o texto ao vivo inteiro (DND-52: a reescrita depois das ferramentas substitui a primeira versão). */
    replace?(text: string): void
}

export interface MaddoxNarrationContext {
    campaignId: string
    /** Job da fila da campanha (o token de turno do MCP só vale enquanto ele roda). */
    jobId: string
    turnNumber: number
    /** Declarações do turno dos jogadores que acabou de fechar (vazio na abertura). */
    declarations: MaddoxMasterDeclaration[]
    /** Rodada de testes (Maddox 5): 0 = narração das declarações; acima, continuação com o resultado dos testes da rodada anterior. */
    round?: number
    /** JEV "Início ou fim de combate" (Maddox 6): as declarações provavelmente começam (`start`) ou encerram (`end`) um combate. */
    combatHint?: "start" | "end" | null
    /** Abortado quando a geração passa do teto de duração (`MADDOX_MASTER_GENERATION_TIMEOUT_MS`). */
    signal?: AbortSignal
}

export interface MaddoxAnswerContext {
    campaignId: string
    jobId: string
    turnNumber: number
    questionId: string
    characterName: string
    question: string
    signal?: AbortSignal
}

/** DND-58: um pedido de troca depois do descanso. */
export interface MaddoxRestExchangeContext {
    campaignId: string
    jobId: string
    turnNumber: number
    /** Mensagem do pedido (`kind: "rest-request"`); a resposta liga a ela. */
    requestId: string
    characterId: string
    characterName: string
    restType: "short" | "long"
    request: string
    /** Quem pediu (o jogador ou o dono, pelo Personagem Opex): vai na auditoria. */
    requesterUserId: string
    /** Pedidos e respostas anteriores desta troca (do mais antigo ao atual, sem o pedido atual). */
    thread: { role: "player" | "maddox"; characterName: string | null; content: string; id: string }[]
    signal?: AbortSignal
}

export interface MaddoxMaster {
    /** Narração do turno do mestre (Markdown, com as menções do catálogo resolvidas). Lança em caso de falha. */
    narrate(context: MaddoxNarrationContext, sink: MaddoxMasterSink): Promise<string>
    /** Resposta a uma pergunta feita no turno dos jogadores; não muda o turno. Lança em caso de falha. */
    answer(context: MaddoxAnswerContext, sink: MaddoxMasterSink): Promise<string>
    /** DND-58: avalia e aplica as trocas pedidas depois de um descanso (catálogo + ficha). Lança em caso de falha. */
    restExchange(context: MaddoxRestExchangeContext, sink: MaddoxMasterSink): Promise<string>
}

export async function getMaddoxMaster(): Promise<MaddoxMaster> {
    const { aiMaddoxMaster } = await import("./narrator")
    return aiMaddoxMaster
}
