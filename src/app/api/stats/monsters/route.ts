import { NextResponse } from "next/server"
import { endOfDay, format, startOfDay, subDays } from "date-fns"
import dbConnect from "@/core/database/db"
import { MonsterModel } from "@/features/monsters/models/monster"

export async function GET() {
    try {
        await dbConnect()
        const activeCount = await MonsterModel.countDocuments({ status: "active" })
        const firstRecord = await MonsterModel.findOne().sort({ createdAt: 1 }).select("createdAt").lean()
        const growth = []

        if (firstRecord) {
            let currentDate = startOfDay(new Date(firstRecord.createdAt))
            const endDate = endOfDay(new Date())
            while (currentDate <= endDate) {
                const count = await MonsterModel.countDocuments({
                    createdAt: { $lte: endOfDay(currentDate) },
                    status: "active",
                })
                growth.push({ date: format(currentDate, "dd/MM"), count })
                currentDate = subDays(currentDate, -1)
                if (growth.length > 365) break
            }
        }

        return NextResponse.json({ active: activeCount, growth })
    } catch (error) {
        console.error("[Monsters Stats API] Error:", error)
        return NextResponse.json({ error: "Erro ao carregar estatísticas" }, { status: 500 })
    }
}
