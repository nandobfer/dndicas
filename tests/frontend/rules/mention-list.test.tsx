import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import MentionList from '@/features/rules/components/mention-list'
import type { MentionListRef } from '@/features/rules/components/mention-list'

vi.mock('@/components/ui/glass-popover', async () => {
    const React = await import('react')
    const OpenContext = React.createContext(false)

    return {
        GlassPopover: ({ open, children }: { open: boolean; children: React.ReactNode }) => (
            <OpenContext.Provider value={open}>{children}</OpenContext.Provider>
        ),
        GlassPopoverAnchor: ({ children }: { children: React.ReactNode }) => <>{children}</>,
        GlassPopoverContent: ({ children, ...props }: { children: React.ReactNode } & React.HTMLAttributes<HTMLDivElement>) => {
            const open = React.useContext(OpenContext)
            return open ? <div data-testid="popover-content" {...props}>{children}</div> : null
        },
    }
})

vi.mock('@/features/rules/components/entity-preview-tooltip', () => ({
    EntityPreviewPanel: ({ entityId, entityType }: { entityId: string; entityType: string }) => (
        <div data-testid="shared-preview">{`${entityType}:${entityId}`}</div>
    ),
}))

describe('MentionList', () => {
    beforeEach(() => {
        vi.useFakeTimers()
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it('renders monster challenge rating and type metadata', () => {
        const command = vi.fn()

        render(
            <MentionList
                items={[
                    {
                        id: 'monster-1',
                        label: 'Dragão Vermelho',
                        entityType: 'Monstro',
                        metadata: {
                            challengeRating: '17',
                            monsterType: 'dragon',
                        },
                    },
                ]}
                command={command}
            />,
        )

        expect(screen.getByText('Dragão Vermelho')).toBeInTheDocument()
        expect(screen.getByText('CR 17')).toBeInTheDocument()
        expect(screen.getByText('Dragão')).toBeInTheDocument()
        expect(screen.getByText('Monstro')).toBeInTheDocument()

        fireEvent.click(screen.getByRole('button', { name: /Dragão Vermelho/i }))

        expect(command).toHaveBeenCalledWith(expect.objectContaining({ id: 'monster-1', entityType: 'Monstro' }))
    })

    it('uses a single shared preview and switches content between hovered items', async () => {
        render(
            <MentionList
                items={[
                    { id: 'monster-1', label: 'Dragão Vermelho', entityType: 'Monstro' },
                    { id: 'spell-1', label: 'Luz', entityType: 'Magia' },
                ]}
                command={vi.fn()}
            />,
        )

        fireEvent.mouseEnter(screen.getByRole('button', { name: /Dragão Vermelho/i }))

        await act(async () => {
            vi.advanceTimersByTime(300)
        })

        expect(screen.getByTestId('shared-preview')).toHaveTextContent('Monstro:monster-1')

        fireEvent.mouseLeave(screen.getByRole('button', { name: /Dragão Vermelho/i }))
        fireEvent.mouseEnter(screen.getByRole('button', { name: /Luz/i }))

        expect(screen.getByTestId('shared-preview')).toHaveTextContent('Magia:spell-1')
        expect(screen.getAllByTestId('shared-preview')).toHaveLength(1)
    })

    it('keeps the shared preview open while the pointer moves from the item into the preview', async () => {
        render(
            <MentionList
                items={[
                    { id: 'monster-1', label: 'Dragão Vermelho', entityType: 'Monstro' },
                ]}
                command={vi.fn()}
            />,
        )

        const button = screen.getByRole('button', { name: /Dragão Vermelho/i })
        fireEvent.mouseEnter(button)

        await act(async () => {
            vi.advanceTimersByTime(300)
        })

        fireEvent.mouseLeave(button)
        fireEvent.mouseEnter(screen.getByTestId('shared-preview'))

        await act(async () => {
            vi.advanceTimersByTime(180)
        })

        expect(screen.getByTestId('shared-preview')).toHaveTextContent('Monstro:monster-1')

        fireEvent.mouseLeave(screen.getByTestId('shared-preview'))

        await act(async () => {
            vi.advanceTimersByTime(180)
        })

        expect(screen.queryByTestId('shared-preview')).not.toBeInTheDocument()
    })

    it('scrolls the selected item into view while navigating with keyboard arrows', async () => {
        const ref = React.createRef<MentionListRef>()

        render(
            <MentionList
                ref={ref}
                items={Array.from({ length: 6 }, (_, index) => ({
                    id: `item-${index + 1}`,
                    label: `Item ${index + 1}`,
                    entityType: 'Regra',
                }))}
                command={vi.fn()}
            />,
        )

        const targetButton = screen.getByRole('button', { name: /Item 3/i })
        const scrollIntoViewMock = vi.fn()
        targetButton.scrollIntoView = scrollIntoViewMock

        await act(async () => {
            ref.current?.onKeyDown({ event: new KeyboardEvent('keydown', { key: 'ArrowDown' }) })
            ref.current?.onKeyDown({ event: new KeyboardEvent('keydown', { key: 'ArrowDown' }) })
        })

        expect(targetButton).toHaveClass('bg-white/20')
        expect(scrollIntoViewMock).toHaveBeenCalledWith({ block: 'nearest' })
    })
})
