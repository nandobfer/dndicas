/**
 * E-mail do core. A configuração não vem mais do `.env`: é a integração "SMTP" (Integrações ›
 * SMTP, banco → `.env` legado), resolvida a cada envio pelo serviço copiado do Opex
 * (`src/lib/email/mailer.ts`). Sem host, os envios ficam em modo simulado (só log).
 */
export { sendEmail, isMockMode, verifyConnection } from "@/lib/email/mailer"
