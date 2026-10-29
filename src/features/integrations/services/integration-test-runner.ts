import { dbConnect } from "@/lib/db";
import { IntegrationStatus } from "@/lib/db/models/IntegrationStatus";
import {
  INTEGRATIONS,
  INTEGRATION_STATUS_EVENT,
  integrationDebugChannel,
  type IntegrationId,
} from "@/lib/integrations/catalog";
import { getIntegrationConfig } from "@/lib/integrations/config";
import { integrationDebug } from "@/lib/integrations/debug";
import type { IntegrationLogLevel } from "@/lib/integrations/log-format";
import { logger } from "@/lib/logger";
import { INTEGRATION_TESTERS } from "../testers/testers";
import type { IntegrationTester, TestEmit } from "../testers/types";
import type { IntegrationHealthDto, IntegrationStatusEvent } from "../types";

/** Tempo máximo de um teste completo, somando todas as etapas. */
export const INTEGRATION_TEST_TIMEOUT_MS = 60_000;

export interface IntegrationTestResult {
  ok: boolean;
  warn?: boolean;
  latencyMs: number;
  message: string;
}

interface RunOptions {
  emit?: TestEmit;
  source: "manual" | "scheduler";
  signal?: AbortSignal;
  testers?: Partial<Record<IntegrationId, IntegrationTester>>;
}

/**
 * Executa o teste de conexão de uma integração e grava o resultado como status atual.
 *
 * O mesmo caminho atende o botão "Testar conexão" (stream para o modal) e o health check
 * periódico do agendador (sem stream). Cada linha também vai para o debug da integração,
 * então quem acompanha o console da integração vê o teste acontecendo.
 */
export async function runIntegrationTest(
  id: IntegrationId,
  options: RunOptions,
): Promise<IntegrationTestResult> {
  const tester = options.testers?.[id] ?? INTEGRATION_TESTERS[id];
  const dbg = integrationDebug(id);
  const startedAt = Date.now();
  const signal = AbortSignal.any([
    AbortSignal.timeout(INTEGRATION_TEST_TIMEOUT_MS),
    ...(options.signal ? [options.signal] : []),
  ]);

  const emit: TestEmit = (level: IntegrationLogLevel, message: string) => {
    options.emit?.(level, message);
    dbg[level === "error" ? "warn" : level](`[teste] ${message}`);
  };

  await markRunning(id, options.source);

  let result: IntegrationTestResult;
  try {
    emit(
      "info",
      options.source === "manual"
        ? "Iniciando teste de conexão"
        : "Verificação periódica de status",
    );
    const outcome = await tester({ emit, signal });
    const warn = typeof outcome !== "string";
    const message = warn ? outcome.message : outcome;
    result = { ok: true, warn, latencyMs: Date.now() - startedAt, message };
    emit(warn ? "warn" : "success", `${message} (${result.latencyMs} ms)`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    result = { ok: false, latencyMs: Date.now() - startedAt, message };
    options.emit?.("error", message);
    dbg.error(`[teste] ${message}`);
  }

  const health = await saveStatus(id, result, options.source);
  await publishStatus({ id, checking: false, health });
  return result;
}

/**
 * Marca o teste como em andamento (bolinha azul girando) e avisa as telas abertas. Gravado no
 * Mongo para que o modo sem Pusher (polling) também veja; `toHealth` ignora marcações velhas
 * (instância que caiu no meio do teste).
 */
async function markRunning(id: IntegrationId, source: "manual" | "scheduler") {
  try {
    await dbConnect();
    await IntegrationStatus.updateOne(
      { integrationId: id },
      { $set: { runningSince: new Date() }, $setOnInsert: { source } },
      { upsert: true },
    );
  } catch (error) {
    logger.warn(
      { err: error, integrationId: id },
      "[integrations] Falha ao marcar teste em andamento",
    );
  }
  await publishStatus({ id, checking: true });
}

async function saveStatus(
  id: IntegrationId,
  result: IntegrationTestResult,
  source: "manual" | "scheduler",
): Promise<IntegrationHealthDto> {
  const health: IntegrationHealthDto = {
    status: !result.ok ? "error" : result.warn ? "warn" : "ok",
    latencyMs: result.latencyMs,
    message: result.message.slice(0, 500),
    checkedAt: new Date().toISOString(),
    source,
    checking: false,
  };
  try {
    await dbConnect();
    await IntegrationStatus.updateOne(
      { integrationId: id },
      {
        $set: {
          status: health.status,
          latencyMs: health.latencyMs,
          message: health.message,
          checkedAt: new Date(health.checkedAt!),
          source,
          runningSince: null,
        },
      },
      { upsert: true },
    );
  } catch (error) {
    logger.warn(
      { err: error, integrationId: id },
      "[integrations] Falha ao gravar status da integração",
    );
  }
  return health;
}

/**
 * Publica `status-updated` no canal privado da integração. Usa o cliente sem instrumentação
 * (não é log de debug). Pusher ausente ou com falha nunca quebra o teste.
 */
async function publishStatus(event: IntegrationStatusEvent) {
  try {
    const { getRawPusherServer, isPusherServerConfigured } =
      await import("@/lib/pusher/server");
    if (!(await isPusherServerConfigured())) return;
    const client = await getRawPusherServer();
    await client.trigger(
      integrationDebugChannel(event.id),
      INTEGRATION_STATUS_EVENT,
      event,
    );
  } catch (error) {
    logger.warn(
      { err: error, integrationId: event.id },
      "[integrations] Falha ao publicar status no Pusher",
    );
  }
}

/** Integrações ativáveis (campo público `active`) desativadas ficam fora do teste periódico. */
async function healthCheckQueue(): Promise<IntegrationId[]> {
  const ids: IntegrationId[] = [];
  for (const def of INTEGRATIONS) {
    if (def.publicFields.some((field) => field.key === "active")) {
      const values = (await getIntegrationConfig(def.id).catch(() => null)) as Record<string, unknown> | null;
      if (values?.active !== true) continue;
    }
    ids.push(def.id);
  }
  return ids;
}

/** Health check periódico: todas as integrações (menos as desativadas), em paralelo limitado. */
export async function runAllIntegrationHealthChecks(
  concurrency = 3,
): Promise<Record<string, IntegrationTestResult>> {
  const queue = await healthCheckQueue();
  const results: Record<string, IntegrationTestResult> = {};
  async function worker() {
    for (let id = queue.shift(); id; id = queue.shift()) {
      results[id] = await runIntegrationTest(id, { source: "scheduler" });
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return results;
}
