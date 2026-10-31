/**
 * O mestre da mesa. Desde o Maddox 4 é o narrador com IA (`./narrator`): narra o turno do mestre e responde
 * perguntas, transmitindo o texto ao vivo pelo `sink` e gravando o estado da campanha pelas ferramentas.
 */

export interface MaddoxMasterDeclaration {
    characterName: string
    kind: "declaration" | "pass"
    content: string
    skipped: boolean
}

/** Recebe a geração ao vivo: texto (já sem marcação crua do catálogo) e o uso de ferramentas. */
export interface MaddoxMasterSink {
    delta(text: string): void
    tool(running: boolean): void
}

export interface MaddoxNarrationContext {
    campaignId: string
    /** Job da fila da campanha (o token de turno do MCP só vale enquanto ele roda). */
    jobId: string
    turnNumber: number
    /** Declarações do turno dos jogadores que acabou de fechar (vazio na abertura). */
    declarations: MaddoxMasterDeclaration[]
}

export interface MaddoxAnswerContext {
    campaignId: string
    jobId: string
    turnNumber: number
    questionId: string
    characterName: string
    question: string
}

export interface MaddoxMaster {
    /** Narração do turno do mestre (Markdown, com as menções do catálogo resolvidas). Lança em caso de falha. */
    narrate(context: MaddoxNarrationContext, sink: MaddoxMasterSink): Promise<string>
    /** Resposta a uma pergunta feita no turno dos jogadores; não muda o turno. Lança em caso de falha. */
    answer(context: MaddoxAnswerContext, sink: MaddoxMasterSink): Promise<string>
}

export async function getMaddoxMaster(): Promise<MaddoxMaster> {
    const { aiMaddoxMaster } = await import("./narrator")
    return aiMaddoxMaster
}
