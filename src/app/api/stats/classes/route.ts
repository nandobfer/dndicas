import { NextRequest, NextResponse } from 'next/server';
import dbConnect from "@/core/database/db"
import { CharacterClass } from "@/features/classes/models/character-class"
import { subDays, startOfDay, endOfDay, format } from "date-fns"

export async function GET(_request: NextRequest) {
    try {
        await dbConnect()

        const activeCount = await CharacterClass.countDocuments({ status: "active" })

        // Growth data
        const firstRecord = await CharacterClass.findOne().sort({ createdAt: 1 }).select("createdAt").lean()
        const growth = []
        
        if (firstRecord) {
            const startDate = startOfDay(new Date(firstRecord.createdAt))
            const endDate = endOfDay(new Date())
            let currentDate = startDate
            while (currentDate <= endDate) {
                const count = await CharacterClass.countDocuments({
                    createdAt: { $lte: endOfDay(currentDate) },
                    status: "active"
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
        console.error("[Classes Stats API] Error:", error)
        return NextResponse.json({ error: "Erro ao carregar estatísticas" }, { status: 500 })
    }
}
