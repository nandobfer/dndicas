import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { EntityPreviewTooltip } from '@/features/rules/components/entity-preview-tooltip'

const fetchedMonster = {
    _id: 'monster-1',
    id: 'monster-1',
    name: 'Dragão Vermelho',
    status: 'active',
}

const fetchedSpell = {
    _id: 'spell-1',
    name: 'Luz',
    description: '<p>Luz.</p>',
    circle: 0,
    school: 'Evocação',
    component: ['Verbal'],
    source: 'PHB',
    status: 'active',
}

const authMocks = vi.hoisted(() => ({
    isAdmin: false,
}))

vi.mock('@/components/ui/glass-popover', async () => {
    const React = await import('react')
    const OpenContext = React.createContext(false)

    return {
        GlassPopover: ({ open, children }: { open: boolean; children: React.ReactNode }) => (
            <OpenContext.Provider value={open}>{children}</OpenContext.Provider>
        ),
        GlassPopoverTrigger: ({ children, ...props }: { children: React.ReactElement } & React.HTMLAttributes<HTMLElement>) =>
            React.cloneElement(React.Children.only(children), props),
        GlassPopoverContent: ({ children }: { children: React.ReactNode }) => {
            const open = React.useContext(OpenContext)
            return open ? <div data-testid="popover-content">{children}</div> : null
        },
    }
})

vi.mock('@/features/monsters/components/monster-preview', () => ({
    MonsterPreview: ({ monster }: { monster: { name: string } }) => <div data-testid="monster-preview">{monster.name}</div>,
}))

vi.mock('@/features/spells/components/spell-preview', () => ({
    SpellPreview: ({ spell }: { spell: { name: string } }) => <div data-testid="spell-preview">{spell.name}</div>,
}))

vi.mock('@/core/hooks/useAuth', () => ({
    useAuth: () => ({ isAdmin: authMocks.isAdmin }),
}))

vi.mock('@/features/entity-generation/components/entity-generation-ai-modal', () => ({
    EntityGenerationAIModal: ({ open, entity }: { open: boolean; entity: { name?: string } | null }) => open ? <div data-testid="generation-modal">{entity?.name}</div> : null,
}))

vi.mock('@/features/entity-generation/adapters/spell-generation-adapter', () => ({
    spellGenerationAdapter: {},
}))

vi.mock('@/core/context/window-context', () => ({
    useWindows: () => ({ addWindow: vi.fn() }),
}))

vi.mock('framer-motion', () => ({
    motion: {
        button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
    },
}))

describe('EntityPreviewTooltip', () => {
    beforeEach(() => {
        authMocks.isAdmin = false
        vi.useFakeTimers()
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            json: vi.fn().mockResolvedValue(fetchedMonster),
        }))
    })

    afterEach(() => {
        vi.useRealTimers()
        vi.unstubAllGlobals()
    })

    it('fetches monster previews from the monsters API and renders MonsterPreview', async () => {
        render(
            <EntityPreviewTooltip entityId="monster-1" entityType="Monstro">
                <button type="button">Dragão Vermelho</button>
            </EntityPreviewTooltip>,
        )

        fireEvent.mouseEnter(screen.getByRole('button', { name: 'Dragão Vermelho' }))

        await act(async () => {
            vi.advanceTimersByTime(300)
            await Promise.resolve()
            await Promise.resolve()
        })

        expect(fetch).toHaveBeenCalledWith('/api/monsters/monster-1')
        expect(screen.getByTestId('monster-preview')).toHaveTextContent('Dragão Vermelho')
    })

    it('renders the AI generation action for admin spell previews', async () => {
        authMocks.isAdmin = true
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            json: vi.fn().mockResolvedValue(fetchedSpell),
        }))

        render(
            <EntityPreviewTooltip entityId="spell-1" entityType="Magia">
                <button type="button">Luz</button>
            </EntityPreviewTooltip>,
        )

        fireEvent.mouseEnter(screen.getByRole('button', { name: 'Luz' }))

        await act(async () => {
            vi.advanceTimersByTime(300)
            await Promise.resolve()
            await Promise.resolve()
        })

        fireEvent.click(screen.getByText('Gerar com IA'))

        expect(fetch).toHaveBeenCalledWith('/api/spells/spell-1')
        expect(screen.getByTestId('spell-preview')).toHaveTextContent('Luz')
        expect(screen.getByTestId('generation-modal')).toHaveTextContent('Luz')
    })
})
