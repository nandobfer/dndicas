import { NextRequest, NextResponse } from 'next/server';
import dbConnect from "@/core/database/db"
import { User } from "@/features/users/models/user"
import { AuditLogExtended } from "@/features/users/models/audit-log-extended"
import { Reference } from "@/core/database/models/reference"
import { Trait } from "@/features/traits/database/trait"
import { Feat } from "@/features/feats/models/feat"
import { Spell } from "@/features/spells/models/spell"
import { CharacterClass } from "@/features/classes/models/character-class"
import { BackgroundModel as Background } from "@/features/backgrounds/models/background"
import { getCurrentUserFromDb } from "@/features/users/api/get-current-user"
import { subDays, startOfDay, endOfDay, format } from "date-fns"

export async function GET(_request: NextRequest) {
    try {
        await dbConnect()

        // 1. Basic Counts
        const [
            totalUsers,
            activeUsers,
            auditLogCount,
            totalRules,
            activeRules,
            totalTraits,
            activeTraits,
            totalFeats,
            activeFeats,
            totalSpells,
            activeSpells,
            totalClasses,
            activeClasses,
            totalBackgrounds,
            activeBackgrounds,
        ] = await Promise.all([
            User.countDocuments({ deleted: { $ne: true } }),
            User.countDocuments({ status: "active", deleted: { $ne: true } }),
            AuditLogExtended.countDocuments(),
            Reference.countDocuments(),
            Reference.countDocuments({ status: "active" }),
            Trait.countDocuments(),
            Trait.countDocuments({ status: "active" }),
            Feat.countDocuments(),
            Feat.countDocuments({ status: "active" }),
            Spell.countDocuments(),
            Spell.countDocuments({ status: "active" }),
            CharacterClass.countDocuments(),
            CharacterClass.countDocuments({ status: "active" }),
            Background.countDocuments(),
            Background.countDocuments({ status: "active" }),
        ])

        // Helper to get growth data for any model from the first record until now
        async function getFullGrowth(model: any) {
            const firstRecord = await model.findOne().sort({ createdAt: 1 }).select("createdAt").lean()
            if (!firstRecord) return []

            const startDate = startOfDay(new Date(firstRecord.createdAt))
            const endDate = endOfDay(new Date())
            const growth = []

            // We'll create points for the progression.
            // If the range is small, we do it daily.
            // If it's very large, we might want to sample it, but for now, let's stick to daily
            // to show the exact progression as requested.
            let currentDate = startDate
            while (currentDate <= endDate) {
                const count = await model.countDocuments({
                    createdAt: { $lte: endOfDay(currentDate) },
                    deleted: { $ne: true }, // For User model compatibility
                })
                growth.push({
                    date: format(currentDate, "dd/MM"),
                    count,
                })
                // Move to next day
                currentDate = subDays(currentDate, -1)

                // Safety break to avoid infinite loops or thousands of queries if data is years old
                if (growth.length > 365) break
            }
            return growth
        }

        // 3. User Growth (Total time)
        const [growthData, rulesGrowth, traitsGrowth, featsGrowth, spellsGrowth, classesGrowth, backgroundsGrowth] = await Promise.all([
            getFullGrowth(User),
            getFullGrowth(Reference),
            getFullGrowth(Trait),
            getFullGrowth(Feat),
            getFullGrowth(Spell),
            getFullGrowth(CharacterClass),
            getFullGrowth(Background),
        ])

        // 4. Audit Logs activity (last 7 days - keeping this as activity is usually short-term)
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
            spells: {
                total: totalSpells,
                active: activeSpells,
                growth: spellsGrowth,
            },
            classes: {
                total: totalClasses,
                active: activeClasses,
                growth: classesGrowth,
            },
            backgrounds: {
                total: totalBackgrounds,
                active: activeBackgrounds,
                growth: backgroundsGrowth,
            },
        })
    } catch (error) {
        console.error("[Dashboard Stats API] Error:", error)
        return NextResponse.json({ error: "Erro ao carregar estatísticas" }, { status: 500 })
    }
}
