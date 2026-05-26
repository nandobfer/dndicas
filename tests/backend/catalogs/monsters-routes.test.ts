import { describe, expect, it, vi } from 'vitest'
import { makeJsonRequest, readJson } from '../helpers/http'
import { importFresh } from '../helpers/module'

describe('monsters backend routes', () => {
    it('GET /api/monsters applies filters and fuzzy search', async () => {
        const monsters = [{ _id: 'monster-1', name: 'Lobo', source: 'LDM', status: 'active' }]
        const sort = vi.fn().mockResolvedValue(monsters)
        const find = vi.fn(() => ({ sort }))
        const applyFuzzySearch = vi.fn().mockReturnValue(monsters)

        vi.doMock('@/core/database/db', () => ({ default: vi.fn().mockResolvedValue(undefined) }))
        vi.doMock('@/features/monsters/models/monster', () => ({ MonsterModel: { find } }))
        vi.doMock('@/core/utils/search-engine', () => ({ applyFuzzySearch }))
        vi.doMock('@clerk/nextjs/server', () => ({ auth: vi.fn() }))
        vi.doMock('@/features/users/api/audit-service', () => ({ createAuditLog: vi.fn() }))

        const mod = await importFresh<typeof import('@/app/api/monsters/route')>('@/app/api/monsters/route')
        const response = await mod.GET(new Request('http://localhost/api/monsters?search=lobo&type=beast&size=M&challengeRating=1&status=active&sources=LDM') as any)
        const payload = await readJson(response)

        expect(response.status).toBe(200)
        expect(find).toHaveBeenCalledWith(expect.objectContaining({
            type: { $in: ['beast'] },
            size: { $in: ['M'] },
            challengeRating: '1',
            status: 'active',
            source: { $in: [expect.any(RegExp)] },
        }))
        expect(applyFuzzySearch).toHaveBeenCalled()
        expect(payload.items).toEqual(monsters.map((monster) => expect.objectContaining({ name: monster.name })))
    })

    it('POST /api/monsters rejects anonymous users', async () => {
        vi.doMock('@clerk/nextjs/server', () => ({ auth: vi.fn().mockResolvedValue({ userId: null }) }))
        vi.doMock('@/features/monsters/models/monster', () => ({ MonsterModel: { findOne: vi.fn(), create: vi.fn() } }))
        vi.doMock('@/core/database/db', () => ({ default: vi.fn().mockResolvedValue(undefined) }))
        vi.doMock('@/core/utils/search-engine', () => ({ applyFuzzySearch: vi.fn() }))
        vi.doMock('@/features/users/api/audit-service', () => ({ createAuditLog: vi.fn() }))

        const mod = await importFresh<typeof import('@/app/api/monsters/route')>('@/app/api/monsters/route')
        const response = await mod.POST(makeJsonRequest('http://localhost/api/monsters', { method: 'POST', body: JSON.stringify({}) }) as any)

        expect(response.status).toBe(401)
    })

    it('POST /api/monsters rejects invalid bodies', async () => {
        vi.doMock('@clerk/nextjs/server', () => ({ auth: vi.fn().mockResolvedValue({ userId: 'clerk-1' }) }))
        vi.doMock('@/features/monsters/models/monster', () => ({ MonsterModel: { findOne: vi.fn(), create: vi.fn() } }))
        vi.doMock('@/core/database/db', () => ({ default: vi.fn().mockResolvedValue(undefined) }))
        vi.doMock('@/core/utils/search-engine', () => ({ applyFuzzySearch: vi.fn() }))
        vi.doMock('@/features/users/api/audit-service', () => ({ createAuditLog: vi.fn() }))

        const mod = await importFresh<typeof import('@/app/api/monsters/route')>('@/app/api/monsters/route')
        const response = await mod.POST(makeJsonRequest('http://localhost/api/monsters', { method: 'POST', body: JSON.stringify({ name: 'A' }) }) as any)

        expect(response.status).toBe(400)
    })

    it('POST /api/monsters rejects duplicate names', async () => {
        vi.doMock('@clerk/nextjs/server', () => ({ auth: vi.fn().mockResolvedValue({ userId: 'clerk-1' }) }))
        vi.doMock('@/features/monsters/models/monster', () => ({
            MonsterModel: { findOne: vi.fn().mockResolvedValue({ _id: 'monster-1' }), create: vi.fn() },
        }))
        vi.doMock('@/core/database/db', () => ({ default: vi.fn().mockResolvedValue(undefined) }))
        vi.doMock('@/core/utils/search-engine', () => ({ applyFuzzySearch: vi.fn() }))
        vi.doMock('@/features/users/api/audit-service', () => ({ createAuditLog: vi.fn() }))

        const mod = await importFresh<typeof import('@/app/api/monsters/route')>('@/app/api/monsters/route')
        const response = await mod.POST(makeJsonRequest('http://localhost/api/monsters', {
            method: 'POST',
            body: JSON.stringify({
                name: 'Lobo',
                source: 'LDM',
                description: 'Descrição válida para monstro.',
                type: 'beast',
                size: 'M',
                alignment: 'unaligned',
                armorClass: 13,
                hitPointsFormula: '2d8 + 2',
                speed: '12 m',
                attributes: { strength: 12, dexterity: 15, constitution: 12, intelligence: 3, wisdom: 12, charisma: 6 },
                challengeRating: '1/4',
            }),
        }) as any)

        expect(response.status).toBe(409)
    })

    it('GET /api/monsters/search returns active fuzzy results', async () => {
        const monsters = [{ _id: 'monster-1', name: 'Lobo', status: 'active' }]
        const sort = vi.fn().mockResolvedValue(monsters)
        const find = vi.fn(() => ({ sort }))
        const applyFuzzySearch = vi.fn().mockReturnValue(monsters)

        vi.doMock('@/core/database/db', () => ({ default: vi.fn().mockResolvedValue(undefined) }))
        vi.doMock('@/features/monsters/models/monster', () => ({ MonsterModel: { find } }))
        vi.doMock('@/core/utils/search-engine', () => ({ applyFuzzySearch }))

        const mod = await importFresh<typeof import('@/app/api/monsters/search/route')>('@/app/api/monsters/search/route')
        const response = await mod.GET(new Request('http://localhost/api/monsters/search?q=lobo') as any)
        const payload = await readJson(response)

        expect(response.status).toBe(200)
        expect(find).toHaveBeenCalledWith({ status: 'active' })
        expect(applyFuzzySearch).toHaveBeenCalledWith(expect.any(Array), 'lobo')
        expect(payload.items).toHaveLength(1)
    })
})
