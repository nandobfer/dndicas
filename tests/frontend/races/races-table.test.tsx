import { render, screen } from '@testing-library/react'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import type { ReactNode } from 'react'
import { RacesTable } from '@/features/races/components/races-table'
import type { Race } from '@/features/races/types/races.types'

vi.mock('next/link', () => ({
    default: ({ href, children, ...props }: { href: string; children: ReactNode }) => <a href={href} {...props}>{children}</a>,
}))

vi.mock('@/core/hooks/useAuth', () => ({
    useAuth: () => ({ isAdmin: false }),
}))

vi.mock('@/components/ui/glass-image', () => ({
    GlassImage: ({ src, alt, className }: { src: string; alt: string; className?: string }) => <img src={src} alt={alt} className={className} />,
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

const baseRace: Race = {
    _id: 'race-1',
    name: 'Elfo',
    description: '<p>Uma raça ancestral.</p>',
    source: 'PHB',
    status: 'active',
    size: 'Médio',
    speed: '9',
    traits: [],
    spells: [],
    variations: [],
    createdAt: new Date(),
    updatedAt: new Date(),
}

describe('RacesTable', () => {
    beforeEach(() => {
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

    it('renders the race image in the identity column and removes the status column', () => {
        render(<RacesTable data={[{ ...baseRace, image: '/elf.png' }]} isLoading={false} onEdit={vi.fn()} onDelete={vi.fn()} />)

        expect(screen.getByRole('img', { name: 'Elfo' })).toHaveAttribute('src', '/elf.png')
        expect(screen.getByRole('link', { name: 'Elfo' })).toHaveAttribute('href', '/races/elfo')
        expect(screen.queryByText('Status')).not.toBeInTheDocument()
        expect(screen.queryByText('Ativo')).not.toBeInTheDocument()
    })

    it('falls back to the race icon when there is no image', () => {
        render(<RacesTable data={[baseRace]} isLoading={false} onEdit={vi.fn()} onDelete={vi.fn()} />)

        expect(screen.queryByRole('img', { name: 'Elfo' })).not.toBeInTheDocument()
        expect(screen.getByRole('link', { name: 'Elfo' })).toBeInTheDocument()
    })

    it('renders preformatted speed values without duplicating the unit', () => {
        render(<RacesTable data={[{ ...baseRace, speed: '9 metros' }]} isLoading={false} onEdit={vi.fn()} onDelete={vi.fn()} />)

        expect(screen.getByText('9 metros')).toBeInTheDocument()
        expect(screen.queryByText('9 metrosm')).not.toBeInTheDocument()
    })

    it('adds the meter suffix only when the speed is numeric', () => {
        render(<RacesTable data={[{ ...baseRace, speed: '9' }]} isLoading={false} onEdit={vi.fn()} onDelete={vi.fn()} />)

        expect(screen.getByText('9 m')).toBeInTheDocument()
    })
})
