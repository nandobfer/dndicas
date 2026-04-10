import { NextRequest, NextResponse } from 'next/server'
import dbConnect from "@/core/database/db"
import { CharacterSheet } from "@/features/character-sheets/models/character-sheet"
import { subDays, startOfDay, endOfDay, format } from "date-fns"

export async function GET(_request: NextRequest) {
    try {
        await dbConnect()

        const activeCount = await CharacterSheet.countDocuments({})

        const firstRecord = await CharacterSheet.findOne().sort({ createdAt: 1 }).select("createdAt").lean()
        const growth = []

        if (firstRecord) {
            const startDate = startOfDay(new Date((firstRecord as { createdAt: Date }).createdAt))
            const endDate = endOfDay(new Date())
            let currentDate = startDate
            while (currentDate <= endDate) {
                const count = await CharacterSheet.countDocuments({
                    createdAt: { $lte: endOfDay(currentDate) },
                })
                growth.push({
                    date: format(currentDate, "dd/MM"),
                    count,
                })
                currentDate = subDays(currentDate, -1)
                if (growth.length > 365) break
            }
        }

        return NextResponse.json({ active: activeCount, growth })
    } catch (error) {
        console.error("[Sheets Stats API] Error:", error)
        return NextResponse.json({ error: "Erro ao carregar estatísticas" }, { status: 500 })
    }
}
