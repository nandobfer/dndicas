import { act, screen } from '@testing-library/react'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import type { ReactNode } from 'react'
import { renderWithQueryClient as render } from "../test-utils"
import { ClassesTable } from '@/features/classes/components/classes-table'
import type { CharacterClass } from '@/features/classes/types/classes.types'

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

vi.mock('@/components/ui/glass-popover', () => ({
    GlassPopover: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    GlassPopoverTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
    GlassPopoverContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

vi.mock('@/features/classes/components/class-progression-table', () => ({
    ClassProgressionTable: () => <div>Progressao</div>,
}))

const baseClass: CharacterClass = {
    _id: 'class-1',
    name: 'Guerreiro',
    description: '<p>Uma classe marcial.</p>',
    source: 'PHB',
    status: 'active',
    hitDice: 'd10',
    primaryAttributes: ['Força'],
    savingThrows: ['Força', 'Constituição'],
    armorProficiencies: ['Armaduras Leves'],
    weaponProficiencies: ['Armas Simples'],
    skillCount: 2,
    availableSkills: ['Atletismo'],
    spellcasting: false,
    subclasses: [],
    traits: [],
    createdAt: new Date(),
    updatedAt: new Date(),
}

const intersectionObservers: Array<{ trigger: (isIntersecting: boolean) => void }> = []

describe('ClassesTable', () => {
    beforeEach(() => {
        intersectionObservers.length = 0

        class MockIntersectionObserver {
            observe = vi.fn()
            disconnect = vi.fn()
            unobserve = vi.fn()
            takeRecords = vi.fn(() => [])
            root = null
            rootMargin = ''
            thresholds = []
            private callback: IntersectionObserverCallback

            constructor(callback: IntersectionObserverCallback) {
                this.callback = callback
                intersectionObservers.push(this)
            }

            trigger(isIntersecting: boolean) {
                this.callback([{ isIntersecting } as IntersectionObserverEntry], this as unknown as IntersectionObserver)
            }
        }

        vi.stubGlobal('IntersectionObserver', MockIntersectionObserver)
    })

    afterAll(() => {
        vi.unstubAllGlobals()
    })

    it('renders table rows with an image identity cell and an infinite scroll sentinel', () => {
        render(<ClassesTable classes={[{ ...baseClass, image: '/fighter.png' }]} total={1} onEdit={vi.fn()} onDelete={vi.fn()} />)

        expect(screen.getByRole('img', { name: 'Guerreiro' })).toHaveAttribute('src', '/fighter.png')
        expect(screen.getByRole('link', { name: 'Guerreiro' })).toHaveAttribute('href', '/classes/guerreiro')
        expect(screen.getByText('Fim da lista')).toBeInTheDocument()
        expect(screen.queryByText('Status')).not.toBeInTheDocument()
        expect(screen.queryByText('Ativo')).not.toBeInTheDocument()
        expect(screen.queryByText('Próxima')).not.toBeInTheDocument()
    })

    it('falls back to the class icon when there is no image', () => {
        render(<ClassesTable classes={[baseClass]} total={1} onEdit={vi.fn()} onDelete={vi.fn()} />)

        expect(screen.queryByRole('img', { name: 'Guerreiro' })).not.toBeInTheDocument()
        expect(screen.getByRole('link', { name: 'Guerreiro' })).toBeInTheDocument()
    })

    it('loads the next page when the table sentinel intersects', () => {
        const onLoadMore = vi.fn()
        render(<ClassesTable classes={[baseClass]} total={20} hasNextPage onLoadMore={onLoadMore} onEdit={vi.fn()} onDelete={vi.fn()} />)

        act(() => {
            intersectionObservers[0].trigger(true)
        })

        expect(onLoadMore).toHaveBeenCalledTimes(1)
    })
})
