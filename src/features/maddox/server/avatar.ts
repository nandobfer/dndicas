import { generateAndStoreDndImage } from "@/features/ai/server/image-generator"
import { loggerFor } from "@/lib/logger"
import { MADDOX_AVATAR_FRAMING } from "../constants"
import type { MaddoxGeneratedAvatarDto } from "../types"

const log = loggerFor({ module: "maddox", feature: "avatar" })

/** Pedido enviado ao Gerador de imagens: enquadramento fixo de avatar + persona escrita pelo admin. */
export function buildMaddoxAvatarPrompt(persona: string): string {
    return [MADDOX_AVATAR_FRAMING, "Persona:", persona.trim()].join("\n\n")
}

/**
 * Gera o avatar do Maddox (1:1, do peito para cima) com o Gerador de imagens. Só devolve a URL: o
 * avatar só passa a valer quando a configuração é salva. Gerador indisponível = 409 em pt-BR.
 */
export async function generateMaddoxAvatar(persona: string, userId: string): Promise<MaddoxGeneratedAvatarDto> {
    const image = await generateAndStoreDndImage({ prompt: buildMaddoxAvatarPrompt(persona), entityLabel: "Maddox, o mestre narrador", preferredAspectRatio: "1:1", userId })
    log.info({ userId, key: image.key }, "[maddox] avatar gerado")
    return { url: image.url }
}
