/**
 * DND-31: o personagem do Maddox nasce sem nome quando a entrevista começa. Os testes que precisam de um nome
 * antes da consolidação (prompts, reservas, ficha) o gravam direto no personagem com este helper.
 */
export async function nameMaddoxCharacter(campaignId: string, userId: string, name: string, portraitUrl: string | null = null): Promise<void> {
    const { Types } = await import("mongoose")
    const { MaddoxCharacterModel } = await import("@/features/maddox/models")
    const result = await MaddoxCharacterModel.updateOne({ campaignId: new Types.ObjectId(campaignId), userId }, { $set: { name, ...(portraitUrl ? { portraitUrl } : {}) } })
    if (result.matchedCount === 0) throw new Error("personagem não encontrado: comece a entrevista de personagem antes")
}
