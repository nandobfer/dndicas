/**
 * Lista das migrações do app, na ordem de execução. Importado dinamicamente por
 * `runMigrations()` para evitar ciclos de import com os modelos.
 */
import { registerMigrations } from "./index"
import { migratePerfix } from "./migrate-perfix"
import { grantMaddoxPlay } from "./grant-maddox-play"
import { seedIntegrationsFromEnv } from "./seed-integrations-from-env"
import { repairIntegrationIndexes } from "./repair-integration-indexes"
import { ensureAiUsageIndexes } from "./ensure-ai-usage-indexes"
import { ensureAiConsumptionIndexes } from "./ensure-ai-consumption-indexes"
import { ensureOpexIndexes } from "./ensure-opex-indexes"
import { ensureMaddoxIndexes } from "./ensure-maddox-indexes"
import { ensureOpexFeedbackIndexes } from "./ensure-opex-feedback-indexes"

registerMigrations(
    { name: "migrate-perfix", run: migratePerfix },
    { name: "grant-maddox-play", run: () => grantMaddoxPlay() },
    { name: "seed-integrations-from-env", run: () => seedIntegrationsFromEnv() },
    { name: "repair-integration-indexes", run: () => repairIntegrationIndexes() },
    { name: "ensure-ai-usage-indexes", run: () => ensureAiUsageIndexes() },
    { name: "ensure-ai-consumption-indexes", run: () => ensureAiConsumptionIndexes() },
    { name: "ensure-opex-indexes", run: () => ensureOpexIndexes() },
    { name: "ensure-maddox-indexes", run: () => ensureMaddoxIndexes() },
    { name: "ensure-opex-feedback-indexes", run: () => ensureOpexFeedbackIndexes() },
)
