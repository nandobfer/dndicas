import nodemailer, { type Transporter } from "nodemailer"
import { getIntegration } from "@/lib/integrations/config"
import { integrationDebug } from "@/lib/integrations/debug"
import { logger } from "@/lib/logger"

/**
 * Serviço de e-mail do core.
 *
 * A configuração SMTP vem da integração "SMTP" (banco → `.env` legado → default), resolvida a
 * cada envio — e não mais lida do `.env` na carga do módulo. O transporter é recriado quando a
 * configuração muda (`version`).
 */

const dbg = integrationDebug("smtp")

let cached: { version: string; transporter: Transporter } | null = null

async function resolveSmtp() {
    const { values, version } = await getIntegration("smtp")
    const port = Number.isFinite(values.port) ? values.port : 587
    return {
        version,
        host: values.host,
        port,
        user: values.user,
        password: values.password,
        from: values.from || values.user,
    }
}

async function getTransporter(): Promise<{ transporter: Transporter; from?: string } | null> {
    const smtp = await resolveSmtp()
    if (!smtp.host) return null
    if (cached?.version !== smtp.version) {
        dbg.step("Criando transporter SMTP", { host: smtp.host, port: smtp.port, user: smtp.user, secure: smtp.port === 465 })
        cached = {
            version: smtp.version,
            transporter: nodemailer.createTransport({
                host: smtp.host,
                port: smtp.port,
                secure: smtp.port === 465,
                auth: smtp.user || smtp.password ? { user: smtp.user, pass: smtp.password } : undefined,
            }),
        }
    }
    return { transporter: cached.transporter, from: smtp.from }
}

/** Sem host configurado, os envios são simulados (apenas logados). */
export const isMockMode = async (): Promise<boolean> => !(await resolveSmtp()).host

export const getSmtpConfig = async () => {
    const smtp = await resolveSmtp()
    return {
        host: smtp.host,
        port: smtp.port,
        from: smtp.from,
        mock: !smtp.host,
    }
}

export const verifyConnection = async (): Promise<void> => {
    const current = await getTransporter()
    if (!current) return
    dbg.request("Verificando conexão SMTP")
    try {
        await current.transporter.verify()
    } catch (error) {
        dbg.error("Falha ao verificar a conexão SMTP", error)
        throw error
    }
    dbg.success("Conexão SMTP verificada")
}

export const sendEmail = async (to: string, subject: string, html: string) => {
    const current = await getTransporter()
    if (!current) {
        dbg.warn("SMTP sem host configurado: envio simulado", { to, subject })
        logger.info({ to, subject }, "[smtp] Host não configurado: e-mail simulado (não enviado)")
        return
    }
    dbg.request("Enviando e-mail", { to, subject, from: current.from, htmlLength: html.length })
    try {
        const info = await current.transporter.sendMail({
            from: current.from,
            to,
            subject,
            html,
        })
        dbg.success("E-mail enviado", { to, messageId: info.messageId, response: info.response })
    } catch (error) {
        dbg.error("Falha ao enviar e-mail", error, { to, subject })
        throw error
    }
}
