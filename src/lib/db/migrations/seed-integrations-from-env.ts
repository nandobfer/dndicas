import { Integration } from '../models/Integration'
import { INTEGRATIONS } from '@/lib/integrations/catalog'
import { resolvePublicField } from '@/lib/integrations/config'
import { encryptSecret, isSecretBoxConfigured, type EncryptedSecret } from '@/lib/crypto/secretBox'
import { logger } from '@/lib/logger'
import { readLegacyEnv } from '@/lib/integrations/legacy-env'

/** Autor das gravações feitas por migrações. */
const BOOTSTRAP_AUDIT_USER = 'system:migration'

function readEnv(names: readonly string[] | undefined): string | undefined {
  return readLegacyEnv(names)
}

function envFlag(names: readonly string[] | undefined): boolean {
  const value = readEnv(names)?.toLowerCase()
  return value === 'true' || value === '1'
}

/**
 * Cria a configuração de cada integração a partir do `.env` atual e dos
 * valores que antes eram fixos no código.
 *
 * Idempotente e segura com várias instâncias subindo juntas:
 * - documento inexistente é criado com `$setOnInsert` (nunca sobrescreve o que o
 *   administrador editou);
 * - segredo ausente no documento é preenchido a partir do `.env` somente quando a chave de
 *   criptografia existe — sem ela, o segredo continua vindo do `.env` pelo fallback do
 *   resolvedor e a migração apenas avisa.
 *
 * Usa o driver direto (`Integration.collection`) para não passar pelo `auditPlugin`, que
 * reescreveria `updatedBy/updatedAt` em todo boot.
 */
export async function seedIntegrationsFromEnv(): Promise<void> {
  const canEncrypt = isSecretBoxConfigured()
  const now = new Date()
  let created = 0
  let backfilled = 0
  let skippedSecrets = 0

  for (const def of INTEGRATIONS) {
    const publicValues: Record<string, unknown> = {}
    for (const field of def.publicFields) {
      const value = resolvePublicField(field, null)
      if (value !== undefined) publicValues[field.key] = value
    }

    const secretValues: Record<string, EncryptedSecret> = {}
    for (const field of def.secretFields) {
      const value = readEnv(field.env)
      if (!value) continue
      if (!canEncrypt) {
        skippedSecrets++
        continue
      }
      secretValues[field.key] = encryptSecret(value)
    }

    const result = await Integration.collection.updateOne(
      { integrationId: def.id },
      {
        $setOnInsert: {
          integrationId: def.id,
          environment: def.defaultEnvironment,
          debugMode: envFlag(def.debugEnv),
          publicValues,
          secretValues,
          createdBy: BOOTSTRAP_AUDIT_USER,
          createdAt: now,
          updatedBy: BOOTSTRAP_AUDIT_USER,
          updatedAt: now,
        },
      },
      { upsert: true },
    )
    if (result.upsertedCount > 0) {
      created++
      continue
    }

    // Documento já existia: completa apenas segredos que nunca foram gravados.
    for (const [key, box] of Object.entries(secretValues)) {
      const update = await Integration.collection.updateOne(
        { integrationId: def.id, [`secretValues.${key}`]: { $exists: false } },
        { $set: { [`secretValues.${key}`]: box } },
      )
      backfilled += update.modifiedCount
    }
  }

  if (created > 0 || backfilled > 0) {
    logger.info({ created, backfilled }, '[migration] Integrações semeadas a partir do .env')
  }
  if (skippedSecrets > 0) {
    logger.warn(
      { skippedSecrets },
      '[migration] INTEGRATIONS_ENCRYPTION_KEY ausente: segredos continuam sendo lidos do .env',
    )
  }
}
