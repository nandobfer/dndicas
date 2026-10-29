/**
 * Autenticação para endpoints de cron (rotinas agendadas).
 *
 * Os endpoints `/api/routines/*` são chamados pelo agendador interno (Integrações › Crons)
 * ou por um cron externo. A proteção é feita via token estático — o "Cron secret" da
 * integração, com o `CRON_SECRET` do `.env` como fallback.
 *
 * ## Como usar
 * ```
 * Authorization: Bearer <CRON_SECRET>
 * ```
 */

import { timingSafeEqual } from 'crypto'
import type { NextRequest } from 'next/server'
import { getIntegrationConfig } from '@/lib/integrations/config'

/** Comparação em tempo constante do Bearer contra o segredo. Segredo vazio rejeita. */
export function matchesBearer(authorization: string | null, secret: string | undefined): boolean {
  if (!secret) return false
  if (!authorization?.startsWith('Bearer ')) return false
  const token = authorization.slice(7)
  try {
    const tokenBuf = Buffer.from(token)
    const secretBuf = Buffer.from(secret)
    if (tokenBuf.length !== secretBuf.length) return false
    return timingSafeEqual(tokenBuf, secretBuf)
  } catch {
    return false
  }
}

/**
 * Verifica se a requisição contém um token Bearer válido para cron.
 *
 * @param req Requisição Next.js
 * @returns `true` se o token é válido, `false` caso contrário
 */
export async function verifyCronToken(req: NextRequest): Promise<boolean> {
  const { cronSecret } = await getIntegrationConfig('crons')
  return matchesBearer(req.headers.get('authorization'), cronSecret)
}

/**
 * Autenticação do tick do agendador (`/api/routines/scheduler-tick`).
 *
 * Um cron externo costuma enviar `Authorization: Bearer $CRON_SECRET` lido da variável de ambiente,
 * enquanto `verifyCronToken` prioriza o segredo gravado na integração. Para que uma divergência
 * entre os dois não derrube o agendamento, o tick aceita qualquer um deles.
 */
export async function verifySchedulerTickToken(req: NextRequest): Promise<boolean> {
  const authorization = req.headers.get('authorization')
  if (matchesBearer(authorization, process.env.CRON_SECRET?.trim())) return true
  const { cronSecret } = await getIntegrationConfig('crons')
  return matchesBearer(authorization, cronSecret)
}
