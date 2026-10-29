/**
 * Instrumentation do Next.js — executa uma vez quando o servidor inicia.
 *
 * O app roda num único processo Node persistente (PM2 com uma instância ou um processo no Docker):
 * 1. conecta no MongoDB e roda as migrações idempotentes (inclusive a cópia única do `.env` legado
 *    para as integrações, `seed-integrations-from-env`) — sem banco, o app sobe e tenta de novo no
 *    primeiro acesso;
 * 2. inicia o agendador interno das rotinas (Integrações › Crons) com tick a cada minuto. A rota
 *    `/api/routines/scheduler-tick` executa o MESMO motor sob demanda.
 */
export async function register() {
    if (process.env.NEXT_RUNTIME !== "nodejs") return

    const [{ dbConnect }, { logger }] = await Promise.all([import("@/lib/db"), import("@/lib/logger")])
    try {
        await dbConnect()
    } catch (error) {
        logger.error({ err: error }, "[boot] Falha ao conectar no banco ou rodar as migrações; nova tentativa no primeiro acesso")
    }

    const { startCronScheduler } = await import("@/features/integrations/scheduler/cron-scheduler")
    startCronScheduler()
}
