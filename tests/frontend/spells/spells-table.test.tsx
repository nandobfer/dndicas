import { fireEvent, screen } from '@testing-library/react'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import type { ReactNode } from 'react'
import { renderWithQueryClient as render } from "../test-utils"
import { SpellsTable } from '@/features/spells/components/spells-table'
import type { Spell } from '@/features/spells/types/spells.types'

const authMocks = vi.hoisted(() => ({
    isAdmin: false,
}))

vi.mock('next/link', () => ({
    default: ({ href, children, ...props }: { href: string; children: ReactNode }) => <a href={href} {...props}>{children}</a>,
}))

vi.mock('@/core/hooks/useAuth', () => ({
    useAuth: () => ({ isAdmin: authMocks.isAdmin }),
}))

vi.mock('@/components/ui/glass-image', () => ({
    GlassImage: ({ src, alt, className }: { src: string; alt: string; className?: string }) => <img src={src} alt={alt} className={className} />,
}))

vi.mock('@/features/rules/components/entity-preview-tooltip', () => ({
    EntityPreviewTooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

vi.mock('@/components/ui/glass-tooltip', () => ({
    GlassTooltipProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
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

const baseSpell: Spell = {
    _id: 'spell-1',
    name: 'Bola de Fogo',
    description: '<p>Uma explosão de fogo.</p>',
    circle: 3,
    school: 'Evocação',
    component: ['Verbal', 'Somático'],
    source: 'PHB',
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
}

describe('SpellsTable', () => {
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

    afterAll(() => {
        vi.unstubAllGlobals()
    })

    it('renders the spell image in the identity column and removes the status column', () => {
        render(<SpellsTable spells={[{ ...baseSpell, image: '/fireball.png' }]} total={1} onEdit={vi.fn()} onDelete={vi.fn()} />)

        expect(screen.getByRole('img', { name: 'Bola de Fogo' })).toHaveAttribute('src', '/fireball.png')
        expect(screen.getByRole('link', { name: 'Bola de Fogo' })).toHaveAttribute('href', '/spells/bola-de-fogo')
        expect(screen.queryByText('Status')).not.toBeInTheDocument()
        expect(screen.queryByText('Ativo')).not.toBeInTheDocument()
    })

    it('falls back to the spell icon when there is no image', () => {
        render(<SpellsTable spells={[baseSpell]} total={1} onEdit={vi.fn()} onDelete={vi.fn()} />)

        expect(screen.queryByRole('img', { name: 'Bola de Fogo' })).not.toBeInTheDocument()
        expect(screen.getByRole('link', { name: 'Bola de Fogo' })).toBeInTheDocument()
    })

    it('renders the AI generation action for admins', () => {
        authMocks.isAdmin = true
        const onGenerateAI = vi.fn()

        render(<SpellsTable spells={[baseSpell]} total={1} onEdit={vi.fn()} onDelete={vi.fn()} onGenerateAI={onGenerateAI} />)

        fireEvent.click(screen.getByText('Gerar com IA'))

        expect(onGenerateAI).toHaveBeenCalledWith(baseSpell)
    })
})
