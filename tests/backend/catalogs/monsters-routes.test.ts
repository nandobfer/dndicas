/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, expect, it, vi } from 'vitest'
import { makeJsonRequest, readJson } from '../helpers/http'
import { importFresh } from '../helpers/module'

describe('monsters backend routes', () => {
    it('GET /api/monsters applies filters, fuzzy search, source matching, and preserves fuzzy ranking', async () => {
        const monsters = [
            { _id: 'monster-1', name: 'Extorsionista Merrow', originalName: 'Merrow Extortionist', source: 'LDM', status: 'active' },
            { _id: 'monster-2', name: 'Merrow', originalName: 'Merrow', source: 'LDM', status: 'active' },
        ]
        const sort = vi.fn().mockResolvedValue(monsters)
        const find = vi.fn(() => ({ sort }))
        const applyFuzzySearch = vi.fn().mockReturnValue([monsters[1], monsters[0]])

        vi.doMock('@/core/database/db', () => ({ default: vi.fn().mockResolvedValue(undefined) }))
        vi.doMock('@/features/monsters/models/monster', () => ({ MonsterModel: { find } }))
        vi.doMock('@/core/utils/search-engine', () => ({ applyFuzzySearch }))
        vi.doMock('@/core/auth/server', () => ({ auth: vi.fn() }))
        vi.doMock('@/features/users/api/audit-service', () => ({ createAuditLog: vi.fn() }))

        const mod = await importFresh<typeof import('@/app/api/monsters/route')>('@/app/api/monsters/route')
        const response = await mod.GET(new Request('http://localhost/api/monsters?search=Merrow&type=beast&size=M&challengeRating=1&status=active&sources=LDM') as any)
        const payload = await readJson<{
            items: Array<{ name: string }>
        }>(response)

        expect(response.status).toBe(200)
        expect(find).toHaveBeenCalledWith(expect.objectContaining({
            type: { $in: ['beast'] },
            size: { $in: ['M'] },
            challengeRating: '1',
            status: 'active',
            source: { $in: expect.arrayContaining([expect.any(RegExp)]) },
        }))
        expect(sort).toHaveBeenCalledWith({ name: 1 })
        expect(applyFuzzySearch).toHaveBeenCalled()
        expect(payload.items.map((monster: { name: string }) => monster.name)).toEqual(['Merrow', 'Extorsionista Merrow'])
    })

    it('GET /api/monsters keeps alphabetical database order when there is no search', async () => {
        const monsters = [
            { _id: 'monster-1', name: 'Aranha', source: 'LDM', status: 'active' },
            { _id: 'monster-2', name: 'Zumbi', source: 'LDM', status: 'active' },
        ]
        const sort = vi.fn().mockResolvedValue(monsters)
        const find = vi.fn(() => ({ sort }))
        const applyFuzzySearch = vi.fn()

        vi.doMock('@/core/database/db', () => ({ default: vi.fn().mockResolvedValue(undefined) }))
        vi.doMock('@/features/monsters/models/monster', () => ({ MonsterModel: { find } }))
        vi.doMock('@/core/utils/search-engine', () => ({ applyFuzzySearch }))
        vi.doMock('@/core/auth/server', () => ({ auth: vi.fn() }))
        vi.doMock('@/features/users/api/audit-service', () => ({ createAuditLog: vi.fn() }))

        const mod = await importFresh<typeof import('@/app/api/monsters/route')>('@/app/api/monsters/route')
        const response = await mod.GET(new Request('http://localhost/api/monsters') as any)
        const payload = await readJson<{ items: Array<{ name: string }> }>(response)

        expect(response.status).toBe(200)
        expect(sort).toHaveBeenCalledWith({ name: 1 })
        expect(applyFuzzySearch).not.toHaveBeenCalled()
        expect(payload.items.map((monster) => monster.name)).toEqual(['Aranha', 'Zumbi'])
    })

    it('GET /api/monsters accepts canonical source labels and still matches legacy abbreviations', async () => {
        const monsters = [{ _id: 'monster-1', name: 'Aranha', source: 'LDM', status: 'active' }]
        const sort = vi.fn().mockResolvedValue(monsters)
        const find = vi.fn(() => ({ sort }))

        vi.doMock('@/core/database/db', () => ({ default: vi.fn().mockResolvedValue(undefined) }))
        vi.doMock('@/features/monsters/models/monster', () => ({ MonsterModel: { find } }))
        vi.doMock('@/core/utils/search-engine', () => ({ applyFuzzySearch: vi.fn().mockReturnValue(monsters) }))
        vi.doMock('@/core/auth/server', () => ({ auth: vi.fn() }))
        vi.doMock('@/features/users/api/audit-service', () => ({ createAuditLog: vi.fn() }))

        const mod = await importFresh<typeof import('@/app/api/monsters/route')>('@/app/api/monsters/route')
        const response = await mod.GET(new Request('http://localhost/api/monsters?sources=Monster%20Manual') as any)

        expect(response.status).toBe(200)
        expect(find).toHaveBeenCalledWith(expect.objectContaining({
            source: {
                $in: expect.arrayContaining([expect.any(RegExp)]),
            },
        }))

        const findCalls = find.mock.calls as unknown as Array<[{ source: { $in: RegExp[] } }]>
        const sourceMatchers = findCalls[0][0].source.$in
        expect(sourceMatchers.some((regex) => regex.test('LDM pág. 98'))).toBe(true)
    })

    it('POST /api/monsters rejects anonymous users', async () => {
        vi.doMock('@/core/auth/server', () => ({ auth: vi.fn().mockResolvedValue({ userId: null }) }))
        vi.doMock('@/features/monsters/models/monster', () => ({ MonsterModel: { findOne: vi.fn(), create: vi.fn() } }))
        vi.doMock('@/core/database/db', () => ({ default: vi.fn().mockResolvedValue(undefined) }))
        vi.doMock('@/core/utils/search-engine', () => ({ applyFuzzySearch: vi.fn() }))
        vi.doMock('@/features/users/api/audit-service', () => ({ createAuditLog: vi.fn() }))

        const mod = await importFresh<typeof import('@/app/api/monsters/route')>('@/app/api/monsters/route')
        const response = await mod.POST(makeJsonRequest('http://localhost/api/monsters', { method: 'POST', body: JSON.stringify({}) }) as any)

        expect(response.status).toBe(401)
    })

    it('POST /api/monsters rejects invalid bodies', async () => {
        vi.doMock('@/core/auth/server', () => ({ auth: vi.fn().mockResolvedValue({ userId: 'clerk-1' }) }))
        vi.doMock('@/features/monsters/models/monster', () => ({ MonsterModel: { findOne: vi.fn(), create: vi.fn() } }))
        vi.doMock('@/core/database/db', () => ({ default: vi.fn().mockResolvedValue(undefined) }))
        vi.doMock('@/core/utils/search-engine', () => ({ applyFuzzySearch: vi.fn() }))
        vi.doMock('@/features/users/api/audit-service', () => ({ createAuditLog: vi.fn() }))

        const mod = await importFresh<typeof import('@/app/api/monsters/route')>('@/app/api/monsters/route')
        const response = await mod.POST(makeJsonRequest('http://localhost/api/monsters', { method: 'POST', body: JSON.stringify({ name: 'A' }) }) as any)

        expect(response.status).toBe(400)
    })

    it('POST /api/monsters rejects duplicate names', async () => {
        vi.doMock('@/core/auth/server', () => ({ auth: vi.fn().mockResolvedValue({ userId: 'clerk-1' }) }))
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

        vi.doMock('@/core/auth/server', () => ({ auth: vi.fn().mockResolvedValue({ userId: 'clerk-1' }) }))
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
        const payload = await readJson<{
            items: unknown[]
        }>(response)

        expect(response.status).toBe(200)
        expect(find).toHaveBeenCalledWith({ status: 'active' })
        expect(applyFuzzySearch).toHaveBeenCalledWith(expect.any(Array), 'lobo')
        expect(payload.items).toHaveLength(1)
    })

    it('GET /api/npcs preserves fuzzy ranking when search is active', async () => {
        const npcs = [
            { _id: 'npc-1', name: 'Extorsionista Merrow', originalName: 'Merrow Extortionist', userId: 'user-1', status: 'active' },
            { _id: 'npc-2', name: 'Merrow', originalName: 'Merrow', userId: 'user-1', status: 'active' },
        ]
        const sort = vi.fn().mockResolvedValue(npcs)
        const find = vi.fn(() => ({ sort }))
        const applyFuzzySearch = vi.fn().mockReturnValue([npcs[1], npcs[0]])

        vi.doMock('@/core/auth/server', () => ({ auth: vi.fn().mockResolvedValue({ userId: 'user-1' }) }))
        vi.doMock('@/core/database/db', () => ({ default: vi.fn().mockResolvedValue(undefined) }))
        vi.doMock('@/features/monsters/models/user-npc', () => ({ UserNpcModel: { find } }))
        vi.doMock('@/core/utils/search-engine', () => ({ applyFuzzySearch }))

        const mod = await importFresh<typeof import('@/app/api/npcs/route')>('@/app/api/npcs/route')
        const response = await mod.GET(new Request('http://localhost/api/npcs?search=Merrow') as any)
        const payload = await readJson<{ items: Array<{ name: string }> }>(response)

        expect(response.status).toBe(200)
        expect(find).toHaveBeenCalledWith({ userId: 'user-1' })
        expect(sort).toHaveBeenCalledWith({ name: 1 })
        expect(payload.items.map((npc) => npc.name)).toEqual(['Merrow', 'Extorsionista Merrow'])
    })

    it('GET /api/npcs filters sources only within the authenticated user NPCs', async () => {
        const npcs = [{ _id: 'npc-1', name: 'Mercador', source: 'Homebrew', userId: 'user-1', status: 'active' }]
        const sort = vi.fn().mockResolvedValue(npcs)
        const find = vi.fn(() => ({ sort }))
        const applyFuzzySearch = vi.fn()

        vi.doMock('@/core/auth/server', () => ({ auth: vi.fn().mockResolvedValue({ userId: 'user-1' }) }))
        vi.doMock('@/core/database/db', () => ({ default: vi.fn().mockResolvedValue(undefined) }))
        vi.doMock('@/features/monsters/models/user-npc', () => ({ UserNpcModel: { find } }))
        vi.doMock('@/core/utils/search-engine', () => ({ applyFuzzySearch }))

        const mod = await importFresh<typeof import('@/app/api/npcs/route')>('@/app/api/npcs/route')
        const response = await mod.GET(new Request('http://localhost/api/npcs?sources=Homebrew') as any)

        expect(response.status).toBe(200)
        expect(find).toHaveBeenCalledWith(expect.objectContaining({
            userId: 'user-1',
            source: { $in: expect.arrayContaining([expect.any(RegExp)]) },
        }))

        const findCalls = find.mock.calls as unknown as Array<[{ source: { $in: RegExp[] } }]>
        const sourceMatchers = findCalls[0][0].source.$in
        expect(sourceMatchers.some((regex) => regex.test('Homebrew pág. 1'))).toBe(true)
        expect(applyFuzzySearch).not.toHaveBeenCalled()
    })

    it('POST /api/npcs/copy rejects anonymous users', async () => {
        vi.doMock('@/core/auth/server', () => ({ auth: vi.fn().mockResolvedValue({ userId: null }) }))
        vi.doMock('@/core/database/db', () => ({ default: vi.fn().mockResolvedValue(undefined) }))
        vi.doMock('@/features/monsters/models/monster', () => ({ MonsterModel: { findById: vi.fn() } }))
        vi.doMock('@/features/monsters/models/user-npc', () => ({ UserNpcModel: { findOne: vi.fn(), create: vi.fn() } }))

        const mod = await importFresh<typeof import('@/app/api/npcs/copy/route')>('@/app/api/npcs/copy/route')
        const response = await mod.POST(makeJsonRequest('http://localhost/api/npcs/copy', {
            method: 'POST',
            body: JSON.stringify({ sourceType: 'monster', sourceId: 'monster-1' }),
        }) as any)

        expect(response.status).toBe(401)
    })

    it('POST /api/npcs/copy copies a monster into the authenticated user NPCs', async () => {
        const sourceMonster = {
            _id: 'monster-1',
            toObject: () => ({
                _id: 'monster-1',
                name: 'Lobo',
                source: 'LDM',
                description: 'Descrição válida para monstro.',
                type: 'beast',
                size: 'M',
                alignment: 'unaligned',
                armorClass: '13',
                hitPointsFormula: '2d8 + 2',
                attributes: { strength: 12, dexterity: 15, constitution: 12, intelligence: 3, wisdom: 12, charisma: 6 },
                challengeRating: '1/4',
            }),
        }
        const createdNpc = {
            _id: 'npc-1',
            toObject: () => ({ _id: 'npc-1', name: 'Lobo (Cópia)', userId: 'user-1' }),
        }
        const findById = vi.fn().mockResolvedValue(sourceMonster)
        const findOne = vi.fn().mockResolvedValue(null)
        const create = vi.fn().mockResolvedValue(createdNpc)

        vi.doMock('@/core/auth/server', () => ({ auth: vi.fn().mockResolvedValue({ userId: 'user-1' }) }))
        vi.doMock('@/core/database/db', () => ({ default: vi.fn().mockResolvedValue(undefined) }))
        vi.doMock('@/features/monsters/models/monster', () => ({ MonsterModel: { findById } }))
        vi.doMock('@/features/monsters/models/user-npc', () => ({ UserNpcModel: { findOne, create } }))

        const mod = await importFresh<typeof import('@/app/api/npcs/copy/route')>('@/app/api/npcs/copy/route')
        const response = await mod.POST(makeJsonRequest('http://localhost/api/npcs/copy', {
            method: 'POST',
            body: JSON.stringify({ sourceType: 'monster', sourceId: 'monster-1' }),
        }) as any)
        const payload = await readJson<{ name: string }>(response)

        expect(response.status).toBe(201)
        expect(findById).toHaveBeenCalledWith('monster-1')
        expect(create).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user-1', name: 'Lobo (Cópia)', source: 'LDM', experience: 50 }))
        expect(payload.name).toBe('Lobo (Cópia)')
    })

    it('POST /api/npcs/copy copies only NPCs owned by the authenticated user', async () => {
        const sourceNpc = {
            _id: 'npc-1',
            toObject: () => ({
                _id: 'npc-1',
                name: 'Mercador',
                userId: 'user-1',
                source: 'Homebrew',
                description: 'Descrição válida para NPC.',
                type: 'humanoid',
                size: 'M',
                alignment: 'N',
                armorClass: '12',
                hitPointsFormula: '2d8',
                attributes: { strength: 10, dexterity: 10, constitution: 10, intelligence: 12, wisdom: 12, charisma: 14 },
                challengeRating: '0',
            }),
        }
        const createdNpc = {
            _id: 'npc-2',
            toObject: () => ({ _id: 'npc-2', name: 'Mercador (Cópia)', userId: 'user-1' }),
        }
        const findOne = vi.fn()
            .mockResolvedValueOnce(sourceNpc)
            .mockResolvedValueOnce(null)
        const create = vi.fn().mockResolvedValue(createdNpc)

        vi.doMock('@/core/auth/server', () => ({ auth: vi.fn().mockResolvedValue({ userId: 'user-1' }) }))
        vi.doMock('@/core/database/db', () => ({ default: vi.fn().mockResolvedValue(undefined) }))
        vi.doMock('@/features/monsters/models/monster', () => ({ MonsterModel: { findById: vi.fn() } }))
        vi.doMock('@/features/monsters/models/user-npc', () => ({ UserNpcModel: { findOne, create } }))

        const mod = await importFresh<typeof import('@/app/api/npcs/copy/route')>('@/app/api/npcs/copy/route')
        const response = await mod.POST(makeJsonRequest('http://localhost/api/npcs/copy', {
            method: 'POST',
            body: JSON.stringify({ sourceType: 'npc', sourceId: 'npc-1' }),
        }) as any)

        expect(response.status).toBe(201)
        expect(findOne).toHaveBeenNthCalledWith(1, { _id: 'npc-1', userId: 'user-1' })
        expect(create).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user-1', name: 'Mercador (Cópia)' }))
    })

    it('POST /api/npcs/copy generates a unique copy name on conflict', async () => {
        const sourceMonster = {
            _id: 'monster-1',
            toObject: () => ({
                _id: 'monster-1',
                name: 'Goblin',
                source: 'LDM',
                description: 'Descrição válida para monstro.',
                type: 'humanoid',
                size: 'S',
                alignment: 'NE',
                armorClass: '15',
                hitPointsFormula: '2d6',
                attributes: { strength: 8, dexterity: 14, constitution: 10, intelligence: 10, wisdom: 8, charisma: 8 },
                challengeRating: '1/4',
            }),
        }
        const findOne = vi.fn()
            .mockResolvedValueOnce({ _id: 'npc-copy-1' })
            .mockResolvedValueOnce(null)
        const create = vi.fn().mockResolvedValue({ _id: 'npc-1', toObject: () => ({ _id: 'npc-1', name: 'Goblin (Cópia 2)' }) })

        vi.doMock('@/core/auth/server', () => ({ auth: vi.fn().mockResolvedValue({ userId: 'user-1' }) }))
        vi.doMock('@/core/database/db', () => ({ default: vi.fn().mockResolvedValue(undefined) }))
        vi.doMock('@/features/monsters/models/monster', () => ({ MonsterModel: { findById: vi.fn().mockResolvedValue(sourceMonster) } }))
        vi.doMock('@/features/monsters/models/user-npc', () => ({ UserNpcModel: { findOne, create } }))

        const mod = await importFresh<typeof import('@/app/api/npcs/copy/route')>('@/app/api/npcs/copy/route')
        const response = await mod.POST(makeJsonRequest('http://localhost/api/npcs/copy', {
            method: 'POST',
            body: JSON.stringify({ sourceType: 'monster', sourceId: 'monster-1' }),
        }) as any)

        expect(response.status).toBe(201)
        expect(findOne).toHaveBeenNthCalledWith(1, { userId: 'user-1', name: 'Goblin (Cópia)' })
        expect(findOne).toHaveBeenNthCalledWith(2, { userId: 'user-1', name: 'Goblin (Cópia 2)' })
        expect(create).toHaveBeenCalledWith(expect.objectContaining({ name: 'Goblin (Cópia 2)' }))
    })
})
