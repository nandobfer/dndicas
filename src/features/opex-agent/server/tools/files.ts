import { z } from "zod"
import { formatAttachmentSize } from "@/lib/attachments"
import { OPEX_FILE_TEXT_INLINE_MAX, OPEX_FILE_TEXT_MAX_BYTES } from "../../constants"
import { opexFileKind } from "../../files"
import { decodeText, listSessionFiles, loadSessionFile, readOpexFileBytes } from "../files"
import { defineTool, OpexToolError } from "./define"

export const fileTools = [
    defineTool({
        name: "list_chat_files",
        group: "files",
        minRole: "user",
        label: "Arquivos do chat",
        risk: "read",
        description: "Arquivos enviados nesta sessão do chat (fileId, nome, tipo, tamanho e se já foram enviados numa mensagem).",
        input: z.object({}),
        execute: async (_input, context) => listSessionFiles(context.sessionId),
    }),
    defineTool({
        name: "read_chat_file",
        group: "files",
        minRole: "user",
        label: "Ler arquivo",
        risk: "read",
        description: `Lê o conteúdo de texto de um arquivo do chat (txt, md, csv, json, código...), em janelas de até ${OPEX_FILE_TEXT_INLINE_MAX.toLocaleString("pt-BR")} caracteres. Use para arquivos grandes ou de mensagens antigas.`,
        input: z.object({
            fileId: z.string(),
            offset: z.number().int().min(0).optional().describe("Caractere inicial (padrão 0)"),
            limit: z.number().int().min(1).max(OPEX_FILE_TEXT_INLINE_MAX).optional(),
        }),
        execute: async ({ fileId, offset, limit }, context) => {
            const doc = await loadSessionFile(context.sessionId, fileId)
            if (opexFileKind(doc.mediaType, doc.name) !== "text") throw new OpexToolError(`"${doc.name}" não é um arquivo de texto (${doc.mediaType}): não dá para ler o conteúdo como texto.`)
            if (doc.size > OPEX_FILE_TEXT_MAX_BYTES) throw new OpexToolError(`"${doc.name}" tem ${formatAttachmentSize(doc.size)}: o limite de leitura é ${formatAttachmentSize(OPEX_FILE_TEXT_MAX_BYTES)}.`)
            const window = decodeText(await readOpexFileBytes(doc), offset ?? 0, limit ?? OPEX_FILE_TEXT_INLINE_MAX)
            return { name: doc.name, offset: offset ?? 0, total: window.total, truncated: window.truncated, text: window.text }
        },
    }),
]
