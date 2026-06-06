import { fireEvent, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import type { ReactNode } from 'react'
import { renderWithQueryClient as render } from "../test-utils"
import { FeatsTable } from '@/features/feats/components/feats-table'
import type { Feat } from '@/features/feats/types/feats.types'

const authMocks = vi.hoisted(() => ({
    isAdmin: false,
}))

vi.mock('next/link', () => ({
    default: ({ href, children, ...props }: { href: string; children: ReactNode }) => <a href={href} {...props}>{children}</a>,
}))

vi.mock('@/core/hooks/useAuth', () => ({
    useAuth: () => ({ isAdmin: authMocks.isAdmin }),
}))

vi.mock('@/features/rules/components/entity-preview-tooltip', () => ({
    EntityPreviewTooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

vi.mock('@/features/rules/components/entity-description', () => ({
    EntityDescription: ({ html }: { html: string }) => <div dangerouslySetInnerHTML={{ __html: html }} />,
}))

vi.mock('@/components/ui/glass-tooltip', () => ({
    SimpleGlassTooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

vi.mock('framer-motion', () => ({
    AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
    motion: {
        tr: ({ children, ...props }: React.HTMLAttributes<HTMLTableRowElement>) => <tr {...props}>{children}</tr>,
        div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
        span: ({ children, ...props }: React.HTMLAttributes<HTMLSpanElement>) => <span {...props}>{children}</span>,
    },
}))

vi.mock('@/components/ui/glass-dropdown-menu', () => ({
    GlassDropdownMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    GlassDropdownMenuTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
    GlassDropdownMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    GlassDropdownMenuItem: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
}))

const baseFeat: Feat = {
    _id: 'feat-1',
    name: 'Ator',
    originalName: 'Actor',
    description: '<p>Descrição.</p>',
    source: 'PHB',
    level: 4,
    prerequisites: [],
    attributeBonuses: [{ attribute: 'Carisma', value: 1 }],
    category: 'Geral',
    status: 'active',
    createdAt: '',
    updatedAt: '',
}

describe('FeatsTable', () => {
    beforeEach(() => {
        authMocks.isAdmin = false
        class MockIntersectionObserver {
            observe = vi.fn()
            disconnect = vi.fn()
            unobserve = vi.fn()
            takeRecords = vi.fn(() => [])
            root = null
            rootMargin = ''
            thresholds = []
        }

        vi.stubGlobal('IntersectionObserver', MockIntersectionObserver)
    })

    it('renders the AI generation action for admins', () => {
        authMocks.isAdmin = true
        const onGenerateAI = vi.fn()

        render(<FeatsTable feats={[baseFeat]} onEdit={vi.fn()} onDelete={vi.fn()} onGenerateAI={onGenerateAI} />)

        fireEvent.click(screen.getByText('Gerar com IA'))

        expect(onGenerateAI).toHaveBeenCalledWith(baseFeat)
    })
})
