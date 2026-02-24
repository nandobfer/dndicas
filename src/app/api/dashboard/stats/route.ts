import { NextRequest, NextResponse } from 'next/server';
import dbConnect from "@/core/database/db"
import { User } from "@/features/users/models/user"
import { AuditLogExtended } from "@/features/users/models/audit-log-extended"
import { Reference } from "@/core/database/models/reference"
import { Trait } from "@/features/traits/database/trait"
import { Feat } from "@/features/feats/models/feat"
import { getCurrentUserFromDb } from "@/features/users/api/get-current-user"
import { subDays, startOfDay, endOfDay, format } from "date-fns"

export async function GET(_request: NextRequest) {
    try {
        const { user: currentUser } = await getCurrentUserFromDb()
        if (!currentUser) {
            return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
        }

        await dbConnect()

        // 1. Basic Counts
        const [totalUsers, activeUsers, auditLogCount, totalRules, activeRules, totalTraits, activeTraits, totalFeats, activeFeats] = await Promise.all([
            User.countDocuments({ deleted: { $ne: true } }),
            User.countDocuments({ status: "active", deleted: { $ne: true } }),
            AuditLogExtended.countDocuments(),
            Reference.countDocuments(),
            Reference.countDocuments({ status: "active" }),
            Trait.countDocuments(),
            Trait.countDocuments({ status: "active" }),
            Feat.countDocuments(),
            Feat.countDocuments({ status: "active" }),
        ])

        // 2. User Growth (last 7 days)
        const growthData = []
        for (let i = 6; i >= 0; i--) {
            const date = subDays(new Date(), i)
            const count = await User.countDocuments({
                createdAt: { $lte: endOfDay(date) },
                deleted: { $ne: true },
            })
            growthData.push({
                date: format(date, "dd/MM"),
                count,
            })
        }

        // 3. Audit Logs activity (last 7 days)
        const activityData = []
        for (let i = 6; i >= 0; i--) {
            const date = subDays(new Date(), i)
            const count = await AuditLogExtended.countDocuments({
                createdAt: {
                    $gte: startOfDay(date),
                    $lte: endOfDay(date),
                },
            })
            activityData.push({
                date: format(date, "dd/MM"),
                count,
            })
        }

        // 4. Rules Growth (last 7 days)
        const rulesGrowth = []
        for (let i = 6; i >= 0; i--) {
            const date = subDays(new Date(), i)
            const count = await Reference.countDocuments({
                createdAt: { $lte: endOfDay(date) },
            })
            rulesGrowth.push({
                date: format(date, "dd/MM"),
                count,
            })
        }

        // 5. Traits Growth (last 7 days)
        const traitsGrowth = []
        for (let i = 6; i >= 0; i--) {
            const date = subDays(new Date(), i)
            const count = await Trait.countDocuments({
                createdAt: { $lte: endOfDay(date) },
            })
            traitsGrowth.push({
                date: format(date, "dd/MM"),
                count,
            })
        }

        // 6. Feats Growth (last 7 days)
        const featsGrowth = []
        for (let i = 6; i >= 0; i--) {
            const date = subDays(new Date(), i)
            const count = await Feat.countDocuments({
                createdAt: { $lte: endOfDay(date) },
            })
            featsGrowth.push({
                date: format(date, "dd/MM"),
                count,
            })
        }

        return NextResponse.json({
            users: {
                total: totalUsers,
                active: activeUsers,
                growth: growthData,
            },
            auditLogs: {
                total: auditLogCount,
                activity: activityData,
            },
            rules: {
                total: totalRules,
                active: activeRules,
                growth: rulesGrowth,
            },
            traits: {
                total: totalTraits,
                active: activeTraits,
                growth: traitsGrowth,
            },
            feats: {
                total: totalFeats,
                active: activeFeats,
                growth: featsGrowth,
            },
        })
    } catch (error) {
        console.error("[Dashboard Stats API] Error:", error)
        return NextResponse.json({ error: "Erro ao carregar estatísticas" }, { status: 500 })
    }
}
