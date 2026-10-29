/**
 * Storage S3 do core. A configuração não vem mais do `.env`: é a integração "Storage S3"
 * (Integrações › Storage S3, banco → `.env` legado), resolvida a cada operação pelo serviço
 * copiado do Opex (`src/lib/storage/s3.ts`), que recria o cliente quando a configuração muda.
 * As assinaturas exportadas continuam as mesmas para os consumidores.
 */
import { getFileObject, getFileUrl as getSignedFileUrl, uploadFile as uploadToStorage } from "@/lib/storage/s3"

const IMAGE_EXTENSION_BY_MIME_TYPE: Record<string, string> = {
    'image/gif': 'gif',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
};

export const uploadFile = async (key: string, body: Buffer | Uint8Array | Blob | string, mimeType?: string) => {
    return uploadToStorage(key, body, mimeType)
}

export const buildFileProxyUrl = (key: string): string => `/api/upload?key=${encodeURIComponent(key)}`;

export const getImageExtensionFromMimeType = (mimeType: string): string => {
    const extension = IMAGE_EXTENSION_BY_MIME_TYPE[mimeType.toLowerCase()];

    if (!extension) {
        throw new Error(`Unsupported image MIME type: ${mimeType}`);
    }

    return extension;
}

/** URL assinada de leitura (servidor), como antes. */
export const getFileUrl = async (key: string) => {
    return getSignedFileUrl(key, { audience: "server" })
}

/** Objeto do storage no formato usado pela rota de proxy (`Body` em stream e `ContentType`). */
export const getFile = async (key: string) => {
    const file = await getFileObject(key)
    return { Body: file.body, ContentType: file.contentType }
}
