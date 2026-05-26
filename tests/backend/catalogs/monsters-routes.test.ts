/* eslint-disable @typescript-eslint/no-explicit-any */

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

    it('PUT /api/monsters/[id] unsets removed speed fields', async () => {
        const oldMonster = {
            _id: 'monster-1',
            toObject: () => ({ _id: 'monster-1', name: 'Sahuagin', speed: '9m', flySpeed: '18m', swimSpeed: '12m', climbSpeed: '6m' }),
        }
        const updatedMonster = {
            _id: 'monster-1',
            toObject: () => ({ _id: 'monster-1', name: 'Sahuagin' }),
        }
        const findById = vi.fn().mockResolvedValue(oldMonster)
        const findByIdAndUpdate = vi.fn().mockResolvedValue(updatedMonster)

        vi.doMock('@clerk/nextjs/server', () => ({ auth: vi.fn().mockResolvedValue({ userId: 'clerk-1' }) }))
        vi.doMock('@/features/monsters/models/monster', () => ({ MonsterModel: { findById, findByIdAndUpdate } }))
        vi.doMock('@/core/database/db', () => ({ default: vi.fn().mockResolvedValue(undefined) }))
        vi.doMock('@/features/users/api/audit-service', () => ({ createAuditLog: vi.fn() }))

        const mod = await importFresh<typeof import('@/app/api/monsters/[id]/route')>('@/app/api/monsters/[id]/route')
        const response = await mod.PUT(makeJsonRequest('http://localhost/api/monsters/monster-1', {
            method: 'PUT',
            body: JSON.stringify({
                name: 'Sahuagin',
                description: 'Descrição válida para monstro.',
                source: 'LDM',
                type: 'humanoid',
                size: 'M',
                alignment: 'LE',
                armorClass: 12,
                hitPointsFormula: '4d8 + 4',
                attributes: { strength: 13, dexterity: 11, constitution: 12, intelligence: 12, wisdom: 13, charisma: 9 },
                challengeRating: '1/2',
                speed: null,
                flySpeed: null,
                swimSpeed: null,
                climbSpeed: null,
            }),
        }) as any, { params: Promise.resolve({ id: 'monster-1' }) })

        expect(response.status).toBe(200)
        expect(findByIdAndUpdate).toHaveBeenCalledWith('monster-1', expect.objectContaining({
            $unset: {
                speed: '',
                flySpeed: '',
                swimSpeed: '',
                climbSpeed: '',
            },
        }), { new: true })
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
