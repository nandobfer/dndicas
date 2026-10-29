import { logger } from "@/lib/logger"

/**
 * Migrações idempotentes executadas uma vez por processo em `dbConnect()`.
 * Cada item deve ser seguro para rodar repetidamente (usa `$setOnInsert`, checa estado etc.).
 */
export interface Migration {
    readonly name: string
    run(): Promise<void>
}

const MIGRATIONS: Migration[] = []

/** Registra migrações (usado pelos módulos de migração no carregamento). */
export function registerMigrations(...items: Migration[]): void {
    for (const item of items) {
        if (!MIGRATIONS.some((m) => m.name === item.name)) MIGRATIONS.push(item)
    }
}

export async function runMigrations(): Promise<void> {
    await import("./registry")
    for (const migration of MIGRATIONS) {
        try {
            await migration.run()
        } catch (error) {
            logger.error({ err: error, migration: migration.name }, "Falha em migração")
            throw error
        }
    }
}
