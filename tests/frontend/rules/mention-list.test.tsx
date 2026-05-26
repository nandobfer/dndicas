import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import MentionList from '@/features/rules/components/mention-list'

vi.mock('@/features/rules/components/entity-preview-tooltip', () => ({
    EntityPreviewTooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

describe('MentionList', () => {
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
})
