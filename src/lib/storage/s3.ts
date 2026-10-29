import { S3Client, CopyObjectCommand, DeleteObjectCommand, PutObjectCommand, GetObjectCommand, HeadBucketCommand, HeadObjectCommand } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { getIntegration } from "@/lib/integrations/config"
import { integrationDebug } from "@/lib/integrations/debug"

/**
 * Serviço de storage do core.
 *
 * Endpoint, região, bucket, credenciais e expiração da URL assinada vêm da integração
 * "Storage S3" (banco → `.env` legado → default), resolvidos por chamada. O `S3Client` é recriado
 * quando a configuração muda (`version`).
 */

const dbg = integrationDebug("storage_s3")

/**
 * Quem vai usar a URL assinada: `browser` (upload direto do navegador, imagens e mídia) assina com
 * o **Endpoint público** quando configurado; `server` (outros serviços do lado do servidor) assina
 * com o Endpoint interno. A assinatura SigV4 inclui o host, então não dá para trocar o host depois.
 */
export type SignedUrlAudience = "browser" | "server"

/** Como o storage respondeu a uma operação. */
export type StorageErrorKind = "not_found" | "forbidden" | "unavailable"

export interface StorageErrorInfo {
    kind: StorageErrorKind
    /** Status HTTP da resposta (quando houve uma). */
    httpStatus: number | null
    /** Nome/código do erro do SDK. */
    code: string | null
}

/** Códigos que provam que o objeto não existe (não confundir com recusa de acesso). */
const STORAGE_NOT_FOUND_CODES = new Set(["NotFound", "NoSuchKey"])
const STORAGE_FORBIDDEN_CODES = new Set(["AccessDenied", "InvalidAccessKeyId", "SignatureDoesNotMatch", "ExpiredToken", "AuthorizationHeaderMalformed"])
/** Problema de configuração da integração (não é um arquivo ausente): nunca descarta o envio. */
const STORAGE_CONFIG_CODES = new Set(["NoSuchBucket"])

/**
 * Classifica a falha de uma operação no storage.
 *
 * **403 nunca significa "objeto ausente"**: serviços S3 compatíveis respondem 403 para objeto
 * inexistente quando a credencial não tem permissão de listar o bucket. Proxies também podem
 * invalidar a assinatura ao converter HEAD em GET. Só `404`/`NoSuchKey` provam ausência;
 * o resto é recusa de acesso ou indisponibilidade
 * e o objeto pode estar lá.
 */
export function storageErrorInfo(error: unknown): StorageErrorInfo {
    const candidate = error as { name?: unknown; Code?: unknown; $metadata?: { httpStatusCode?: unknown } } | null
    const code = typeof candidate?.name === "string" ? candidate.name : typeof candidate?.Code === "string" ? candidate.Code : null
    const httpStatus = typeof candidate?.$metadata?.httpStatusCode === "number" ? candidate.$metadata.httpStatusCode : null
    const notFound = httpStatus === 404 || (code !== null && STORAGE_NOT_FOUND_CODES.has(code))
    const misconfigured = code !== null && STORAGE_CONFIG_CODES.has(code)
    const forbidden = !notFound && !misconfigured && (httpStatus === 401 || httpStatus === 403 || (code !== null && STORAGE_FORBIDDEN_CODES.has(code)))
    return { kind: notFound && !misconfigured ? "not_found" : forbidden ? "forbidden" : "unavailable", httpStatus, code }
}

let cached: { version: string; client: S3Client; publicClient: S3Client; publicPrefix: string } | null = null

/**
 * Endpoint público atrás de proxy com subcaminho (ex.: `https://host/dev/minio`, com o nginx
 * removendo `/dev/minio` antes do MinIO): assina só com a origem — o MinIO confere a assinatura
 * sobre o caminho que ELE recebe (`/bucket/chave`) — e o subcaminho entra depois, só na URL.
 */
function splitPublicEndpoint(endpoint: string): { origin: string; prefix: string } {
    const url = new URL(endpoint)
    return { origin: url.origin, prefix: url.pathname.replace(/\/+$/, "") }
}

function withPublicPrefix(signed: string, prefix: string): string {
    if (!prefix) return signed
    const url = new URL(signed)
    url.pathname = `${prefix}${url.pathname}`
    return url.toString()
}

const makeClient = (endpoint: string, region: string, accessKeyId: string, secretAccessKey: string) =>
    new S3Client({ region, endpoint, credentials: { accessKeyId, secretAccessKey }, forcePathStyle: true /* MinIO */ })

async function getStorage(audience: SignedUrlAudience = "server"): Promise<{ client: S3Client; bucket: string; expiresIn: number; prefix: string }> {
    const { values, version } = await getIntegration("storage_s3")
    if (!values.accessKey || !values.secretKey || !values.endpoint) {
        dbg.error("Storage S3 sem endpoint ou credenciais configurados")
        throw new Error("S3 Client not initialized")
    }
    if (cached?.version !== version) {
        const publicEndpoint = values.publicEndpoint?.trim() || values.endpoint
        dbg.step("Criando cliente S3", { endpoint: values.endpoint, publicEndpoint, region: values.region, bucket: values.bucket })
        const client = makeClient(values.endpoint, values.region, values.accessKey, values.secretKey)
        const { origin, prefix } = splitPublicEndpoint(publicEndpoint)
        cached = {
            version,
            client,
            // Assinar não acessa a rede: o cliente público só gera URLs com o host do navegador.
            publicClient: publicEndpoint === values.endpoint ? client : makeClient(origin, values.region, values.accessKey, values.secretKey),
            publicPrefix: publicEndpoint === values.endpoint ? "" : prefix,
        }
    }
    return {
        client: audience === "browser" ? cached.publicClient : cached.client,
        bucket: values.bucket,
        expiresIn: values.signedUrlExpiresSeconds,
        prefix: audience === "browser" ? cached.publicPrefix : "",
    }
}

/** Expiração (segundos) aplicada às URLs assinadas. */
export const getSignedUrlExpiresIn = async (): Promise<number> =>
    (await getIntegration("storage_s3")).values.signedUrlExpiresSeconds

export const uploadFile = async (key: string, body: Buffer | Uint8Array | Blob | string, mimeType?: string) => {
    const { client, bucket } = await getStorage()
    dbg.request("Upload de arquivo", { bucket, key, mimeType })
    try {
        const result = await client.send(
            new PutObjectCommand({
                Bucket: bucket,
                Key: key,
                Body: body,
                ContentType: mimeType,
            }),
        )
        dbg.success("Upload concluído", { key, etag: result.ETag })
        return result
    } catch (error) {
        dbg.error("Falha no upload", error, { key })
        throw error
    }
}

/**
 * URL assinada de GET. `downloadName` força o download com esse nome (Content-Disposition).
 * `audience` padrão `browser`; use `server` quando quem baixa é outro serviço do servidor.
 */
export const getFileUrl = async (key: string, options: { downloadName?: string; audience?: SignedUrlAudience; expiresIn?: number } = {}) => {
    const audience = options.audience ?? "browser"
    const storage = await getStorage(audience)
    const { client, bucket, prefix } = storage
    const expiresIn = options.expiresIn ?? storage.expiresIn
    dbg.step("Gerando URL assinada", { bucket, key, expiresIn, audience })
    const command = new GetObjectCommand({
        Bucket: bucket,
        Key: key,
        ...(options.downloadName ? { ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(options.downloadName)}` } : {}),
    })
    return withPublicPrefix(await getSignedUrl(client, command, { expiresIn }), prefix)
}

/**
 * URL assinada de UPLOAD (PUT direto do navegador ao bucket), para arquivos maiores que o limite de
 * corpo das rotas. O bucket precisa aceitar CORS de PUT a partir do domínio do app. `audience`
 * padrão `browser`; use `server` quando quem grava é outro serviço do servidor.
 */
export const getUploadUrl = async (key: string, mimeType: string, expiresIn = 600, audience: SignedUrlAudience = "browser") => {
    const { client, bucket, prefix } = await getStorage(audience)
    dbg.step("Gerando URL assinada de upload", { bucket, key, mimeType, expiresIn, audience })
    return withPublicPrefix(await getSignedUrl(client, new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: mimeType }), { expiresIn }), prefix)
}

export const getFileStream = async (key: string) => {
    const { client, bucket } = await getStorage()
    dbg.request("Leitura de arquivo", { bucket, key })
    try {
        const response = await client.send(
            new GetObjectCommand({
                Bucket: bucket,
                Key: key,
            }),
        )
        dbg.response("Arquivo lido", { key, contentType: response.ContentType, contentLength: response.ContentLength })
        return response.Body
    } catch (error) {
        dbg.error("Falha ao ler arquivo", error, { key })
        throw error
    }
}

export interface StoredFile {
    body: ReadableStream<Uint8Array> | null
    contentType: string | undefined
    contentLength: number | undefined
    lastModified: Date | undefined
    /** Presente quando o pedido levou `Range` (resposta 206). */
    contentRange: string | undefined
    acceptRanges: string | undefined
    etag: string | undefined
}

/**
 * Arquivo do storage como stream web, com tipo e tamanho (repasse do conteúdo por uma rota do app).
 * `range` (cabeçalho `Range`) devolve só o trecho pedido — necessário para o `Range` das mídias.
 */
export const getFileObject = async (key: string, options: { range?: string } = {}): Promise<StoredFile> => {
    const { client, bucket } = await getStorage()
    const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key, ...(options.range ? { Range: options.range } : {}) }))
    const body = response.Body as { transformToWebStream?: () => ReadableStream<Uint8Array> } | undefined
    return {
        body: body?.transformToWebStream?.() ?? null,
        contentType: response.ContentType,
        contentLength: response.ContentLength,
        lastModified: response.LastModified,
        contentRange: response.ContentRange,
        acceptRanges: response.AcceptRanges,
        etag: response.ETag,
    }
}

/**
 * Cópia server-side (não transfere o conteúdo pela rede do app). Promove um objeto temporário à
 * chave definitiva depois do envio direto do navegador.
 */
export const copyFile = async (fromKey: string, toKey: string): Promise<void> => {
    const { client, bucket } = await getStorage()
    dbg.request("Cópia de arquivo", { bucket, fromKey, toKey })
    try {
        await client.send(new CopyObjectCommand({ Bucket: bucket, Key: toKey, CopySource: `${bucket}/${fromKey}` }))
        dbg.success("Cópia concluída", { toKey })
    } catch (error) {
        dbg.error("Falha na cópia", error, { fromKey, toKey })
        throw error
    }
}

/** Remove o objeto. Usada na limpeza de temporários e na exclusão de anexos. */
export const deleteFile = async (key: string): Promise<void> => {
    const { client, bucket } = await getStorage()
    dbg.request("Remoção de arquivo", { bucket, key })
    try {
        await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
        dbg.success("Arquivo removido", { key })
    } catch (error) {
        dbg.error("Falha ao remover arquivo", error, { key })
        throw error
    }
}

/**
 * Metadados do arquivo. Cloudflare pode converter HEAD em GET para extensões cacheáveis
 * com cache frio, invalidando a assinatura SigV4 (que inclui o método). Em 403, tenta um GET
 * autenticado e fecha o stream imediatamente, sem consumir o arquivo nem carregá-lo em memória.
 * Não usa Range: proxies também podem alterar esses cabeçalhos. A autorização continua sendo
 * verificada pelo S3; se o GET falhar, seu erro é propagado, nunca se assume sucesso.
 */
export const headFile = async (key: string): Promise<{ contentType: string | undefined; contentLength: number | undefined; lastModified: Date | undefined }> => {
    const { client, bucket } = await getStorage()
    try {
        const response = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
        return { contentType: response.ContentType, contentLength: response.ContentLength, lastModified: response.LastModified }
    } catch (error) {
        if (storageErrorInfo(error).httpStatus !== 403) throw error
        dbg.step("HEAD recusado; conferindo metadados com GET autenticado", { bucket, key })
        const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
        // O servidor usa o handler Node do SDK: destruir o stream libera a conexão sem ler o corpo.
        const body = response.Body as { destroy?: () => void; cancel?: () => Promise<void> } | undefined
        if (body?.destroy) body.destroy()
        else if (body?.cancel) await body.cancel()
        return { contentType: response.ContentType, contentLength: response.ContentLength, lastModified: response.LastModified }
    }
}

/** Confirma que o bucket existe e que as credenciais têm acesso (teste de conexão). */
export const checkBucket = async (): Promise<{ bucket: string }> => {
    const { client, bucket } = await getStorage()
    await client.send(new HeadBucketCommand({ Bucket: bucket }))
    return { bucket }
}
