import { NextRequest, NextResponse } from 'next/server';
import dbConnect from "@/core/database/db"
import { User } from "@/features/users/models/user"
import { AuditLogExtended } from "@/features/users/models/audit-log-extended"
import { getCurrentUserFromDb } from "@/features/users/api/get-current-user"
import { subDays, startOfDay, endOfDay, format } from "date-fns"

export async function GET(request: NextRequest) {
    try {
        const { user: currentUser } = await getCurrentUserFromDb()
        if (!currentUser) {
            return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
        }

        await dbConnect()

        // 1. Basic Counts
        const [totalUsers, activeUsers, auditLogCount] = await Promise.all([
            User.countDocuments({ deleted: { $ne: true } }),
            User.countDocuments({ status: "active", deleted: { $ne: true } }),
            AuditLogExtended.countDocuments()
        ])

        // 2. User Growth (last 7 days)
        const growthData = []
        for (let i = 6; i >= 0; i--) {
            const date = subDays(new Date(), i)
            const count = await User.countDocuments({
                createdAt: { $lte: endOfDay(date) },
                deleted: { $ne: true }
            })
            growthData.push({
                date: format(date, "dd/MM"),
                count
            })
        }

        // 3. Audit Logs activity (last 7 days)
        const activityData = []
        for (let i = 6; i >= 0; i--) {
            const date = subDays(new Date(), i)
            const count = await AuditLogExtended.countDocuments({
                createdAt: { 
                    $gte: startOfDay(date),
                    $lte: endOfDay(date)
                }
            })
            activityData.push({
                date: format(date, "dd/MM"),
                count
            })
        }

        return NextResponse.json({
            users: {
                total: totalUsers,
                active: activeUsers,
                growth: growthData
            },
            auditLogs: {
                total: auditLogCount,
                activity: activityData
            }
        })
    } catch (error) {
        console.error("[Dashboard Stats API] Error:", error)
        return NextResponse.json({ error: "Erro ao carregar estatísticas" }, { status: 500 })
    }
}
