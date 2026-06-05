import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderEntity } from '@/features/rules/components/entity-renderers'

const fetchMonsterById = vi.fn()

vi.mock('@/features/monsters/api/monsters-api', () => ({
    fetchMonsterById: (...args: unknown[]) => fetchMonsterById(...args),
}))

vi.mock('@/features/monsters/components/npc-preview', () => ({
    NpcPreview: ({ monster }: { monster: { name: string } }) => <div data-testid="monster-preview">{monster.name}</div>,
}))

const completeMonster = {
    _id: 'monster-1',
    id: 'monster-1',
    name: 'Dragão Completo',
    description: 'Um monstro completo.',
    type: 'Monstro',
    status: 'active',
    attributes: {
        strength: 20,
        dexterity: 10,
        constitution: 18,
        intelligence: 14,
        wisdom: 12,
        charisma: 16,
    },
}

describe('MonsterAsyncRenderer', () => {
    beforeEach(() => {
        fetchMonsterById.mockReset()
    })

    it('fetches the full monster before rendering a partial global search result', async () => {
        fetchMonsterById.mockResolvedValueOnce(completeMonster)

        render(
            <>
                {renderEntity(
                    {
                        _id: 'monster-1',
                        id: 'monster-1',
                        name: 'Dragão Parcial',
                        label: 'Dragão Parcial',
                        type: 'Monstro',
                        description: 'Resultado parcial da busca.',
                        status: 'active',
                        metadata: {
                            challengeRating: '5',
                            armorClass: 19,
                        },
                    },
                    'Mixed',
                    { hideActionIcons: true },
                )}
            </>,
        )

        await waitFor(() => expect(fetchMonsterById).toHaveBeenCalledWith('monster-1'))
        expect(await screen.findByTestId('monster-preview')).toHaveTextContent('Dragão Completo')
    })

    it('renders a complete monster without fetching it again', async () => {
        render(<>{renderEntity(completeMonster, 'Monstro', { hideActionIcons: true })}</>)

        expect(await screen.findByTestId('monster-preview')).toHaveTextContent('Dragão Completo')
        expect(fetchMonsterById).not.toHaveBeenCalled()
    })
})
