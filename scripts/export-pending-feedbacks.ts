import { config } from "dotenv"
import mongoose from "mongoose"
import { mkdir, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { pathToFileURL } from "node:url"

type ExportRow = Record<string, unknown> & { _id: unknown }

/** Keep this independent of the retired feedback module so exports remain possible. */
export function buildFeedbackExport(feedbacks: ExportRow[], timeline: Record<string, unknown>[], runs: Record<string, unknown>[]) {
    return {
        schemaVersion: 1,
        exportedAt: new Date().toISOString(),
        count: feedbacks.length,
        notes: "Defina projectId, columnId e clientId no Opex durante a importação. Nenhum dado de origem foi excluído.",
        feedbacks: feedbacks.map((feedback) => ({
            source: feedback,
            timeline: timeline.filter((event) => String(event.feedbackId) === String(feedback._id)),
            runs: runs.filter((run) => String(run.feedbackId) === String(feedback._id)),
            suggestedOpexTask: {
                title: feedback.title,
                description: feedback.description,
                taskType: feedback.type === "bug" ? "bugfix" : "feature",
                priority: feedback.priority === "alta" ? "high" : feedback.priority === "baixa" ? "low" : "medium",
                sourceFeedbackId: String(feedback._id),
                author: feedback.creatorName,
                createdAt: feedback.createdAt,
            },
        })),
    }
}

export async function exportFeedbacks(args = process.argv.slice(2)) {
    const outIndex = args.indexOf("--out")
    const output = outIndex < 0 ? undefined : args[outIndex + 1]
    if (!args.includes("--dry-run") && (!output || output.startsWith("--"))) throw new Error("Informe --out com o caminho do arquivo no host.")
    config({ path: process.env.DNDICAS_ENV_FILE ?? ".env", quiet: true })
    if (!process.env.MONGODB_URI) throw new Error("Configure MONGODB_URI antes de exportar.")
    try {
        await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10_000, ...(args.includes("--direct") ? { directConnection: true } : {}) })
        const db = mongoose.connection.db!
        const feedbacks = await db.collection("feedbacks").find(args.includes("--all") ? {} : { status: "pendente" }).sort({ createdAt: 1 }).toArray()
        const ids = feedbacks.map((feedback) => feedback._id)
        const [timeline, runs] = await Promise.all([
            db.collection("feedbacktimelineevents").find({ feedbackId: { $in: ids } }).sort({ createdAt: 1 }).toArray(),
            db.collection("feedbackagentruns").find({ feedbackId: { $in: ids } }).toArray(),
        ])
        const data = buildFeedbackExport(feedbacks, timeline, runs)
        if (!args.includes("--dry-run")) {
            await mkdir(dirname(resolve(output!)), { recursive: true })
            await writeFile(resolve(output!), JSON.stringify(data, null, 2), { mode: 0o600, flag: args.includes("--force") ? "w" : "wx" })
        }
        console.log(JSON.stringify({ database: db.databaseName, count: data.count, timeline: timeline.length, runs: runs.length, output: args.includes("--dry-run") ? null : resolve(output!) }))
    } finally {
        await mongoose.disconnect()
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    exportFeedbacks().catch(() => { console.error("Não foi possível exportar os feedbacks. Confira o banco e o caminho de saída; nenhum dado foi excluído."); process.exitCode = 1 })
}
