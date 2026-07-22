/**
 * Non-interactive DB query CLI for AI agents and scripts.
 * Outputs clean JSON to stdout. Errors go to stderr as JSON.
 *
 * Usage:
 *   npx tsx scripts/query-db.ts --type Classe --list
 *   npx tsx scripts/query-db.ts --type Classe --search "Lâmina"
 *   npx tsx scripts/query-db.ts --type Classe --id 6a5be0bb70e4f858fb82a1a0
 *   npx tsx scripts/query-db.ts --type Classe --id <id> --fields name,traits,subclasses
 *   npx tsx scripts/query-db.ts --type Magia --search "Bola de Fogo" --limit 5
 *   npx tsx scripts/query-db.ts --type Classe --search "Lâmina" --fields name,subclasses
 */

import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(__dirname, '../.env') })

import mongoose from 'mongoose'
import { Reference } from '@/core/database/models/reference'
import { Trait } from '@/features/traits/database/trait'
import { Feat } from '@/features/feats/models/feat'
import { Spell } from '@/features/spells/models/spell'
import { CharacterClass } from '@/features/classes/models/character-class'
import { BackgroundModel } from '@/features/backgrounds/models/background'
import { RaceModel } from '@/features/races/models/race'
import { ItemModel } from '@/features/items/database/item'

const TYPE_MAP: Record<string, mongoose.Model<any>> = {
    Regra: Reference,
    Habilidade: Trait,
    Talento: Feat,
    Magia: Spell,
    Classe: CharacterClass,
    Origem: BackgroundModel,
    Raça: RaceModel,
    Item: ItemModel,
}

const HELP = `
Usage: npx tsx scripts/query-db.ts [options]

Options:
  --type <type>      Entity type: ${Object.keys(TYPE_MAP).join(', ')}
  --search <query>   Search by name (case-insensitive, partial match)
  --id <objectId>    Find by MongoDB ObjectId (returns single document)
  --list             List all entities of type (returns [{_id, name, originalName, status}])
  --fields <fields>  Comma-separated fields to include (e.g. name,traits,subclasses)
  --limit <n>        Max results for --search (default: 10)
  --status <s>       Filter by status: active | inactive | all (default: active)
  --help             Show this help

Examples:
  npx tsx scripts/query-db.ts --type Classe --list
  npx tsx scripts/query-db.ts --type Classe --search "Lâmina"
  npx tsx scripts/query-db.ts --type Classe --id 6a5be0bb70e4f858fb82a1a0
  npx tsx scripts/query-db.ts --type Classe --id 6a5be0bb70e4f858fb82a1a0 --fields name,traits,subclasses
  npx tsx scripts/query-db.ts --type Magia --search "Bola de Fogo" --limit 5
  npx tsx scripts/query-db.ts --type Talento --status all --list
`

const args = process.argv.slice(2)

function getArg(name: string): string | undefined {
    const idx = args.findIndex(a => a === `--${name}` || a.startsWith(`--${name}=`))
    if (idx === -1) return undefined
    const arg = args[idx]!
    if (arg.includes('=')) return arg.split('=').slice(1).join('=')
    const next = args[idx + 1]
    return (next && !next.startsWith('--')) ? next : undefined
}

function hasFlag(name: string): boolean {
    return args.includes(`--${name}`)
}

function out(data: unknown): void {
    process.stdout.write(JSON.stringify(data, null, 2) + '\n')
}

function fail(msg: string, code = 1): never {
    process.stderr.write(JSON.stringify({ error: msg }) + '\n')
    process.exit(code)
}

async function main(): Promise<void> {
    if (hasFlag('help') || hasFlag('h')) {
        process.stdout.write(HELP)
        process.exit(0)
    }

    const type = getArg('type')
    const search = getArg('search')
    const id = getArg('id')
    const fields = getArg('fields')
    const limit = parseInt(getArg('limit') ?? '10', 10)
    const statusArg = getArg('status') ?? 'active'
    const isList = hasFlag('list')

    if (!type) fail('--type is required. Run with --help for usage.')

    const Model = TYPE_MAP[type]
    if (!Model) fail(`Unknown type "${type}". Valid: ${Object.keys(TYPE_MAP).join(', ')}`)

    const mongoUri = process.env.MONGODB_URI
    if (!mongoUri) fail('MONGODB_URI not set in .env')

    await mongoose.connect(mongoUri, { bufferCommands: false })

    try {
        const statusFilter = statusArg === 'all' ? {} : { status: statusArg }
        const fieldSelect = fields ? fields.split(',').join(' ') : undefined

        if (id) {
            const q = Model.findById(id)
            if (fieldSelect) q.select(fieldSelect)
            const doc = await q.lean()
            if (!doc) fail(`No document found with id: ${id}`, 0)
            out(doc)
            return
        }

        if (isList) {
            const docs = await Model
                .find(statusFilter)
                .select('name originalName status')
                .sort({ name: 1 })
                .lean()
            out(docs)
            return
        }

        if (search) {
            const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
            const regex = new RegExp(escaped, 'i')
            const q = Model
                .find({ ...statusFilter, $or: [{ name: regex }, { originalName: regex }] })
                .limit(limit)
            if (fieldSelect) q.select(fieldSelect)
            const docs = await q.lean()
            out(docs)
            return
        }

        // No filter — return all with optional field projection
        const q = Model.find(statusFilter).sort({ name: 1 })
        if (fieldSelect) q.select(fieldSelect)
        const docs = await q.lean()
        out(docs)
    } finally {
        await mongoose.disconnect()
    }
}

main().catch(err => fail(err instanceof Error ? err.message : String(err)))
