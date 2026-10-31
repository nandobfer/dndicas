/**
 * O mestre da mesa (Maddox 3). Nesta entrega a implementação é o mock (`./game-mock`), sem IA; o Maddox 4
 * troca por uma implementação com o narrador configurado (ferramentas, testes, streaming).
 */

export interface MaddoxMasterDeclaration {
    characterName: string
    kind: "declaration" | "pass"
    content: string
    skipped: boolean
}

export interface MaddoxNarrationContext {
    campaignName: string
    turnNumber: number
    openingSituation: string
    /** Declarações do turno dos jogadores que acabou de fechar (vazio na abertura). */
    declarations: MaddoxMasterDeclaration[]
}

export interface MaddoxAnswerContext {
    campaignName: string
    turnNumber: number
    characterName: string
    question: string
}

export interface MaddoxMaster {
    /** Narração do turno do mestre (Markdown). */
    narrate(context: MaddoxNarrationContext): Promise<string>
    /** Resposta a uma pergunta feita no turno dos jogadores; não muda o turno (Markdown). */
    answer(context: MaddoxAnswerContext): Promise<string>
}

export async function getMaddoxMaster(): Promise<MaddoxMaster> {
    const { mockMaddoxMaster } = await import("./game-mock")
    return mockMaddoxMaster
}
