import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import type { ReactNode } from 'react'
import { MonstersTable } from '@/features/monsters/components/monsters-table'
import type { Monster } from '@/features/monsters/types/monsters.types'

vi.mock('next/link', () => ({
    default: ({ href, children, ...props }: { href: string; children: ReactNode }) => <a href={href} {...props}>{children}</a>,
}))

vi.mock('@/components/ui/glass-image', () => ({
    GlassImage: ({ src, alt, className }: { src: string; alt: string; className?: string }) => <img src={src} alt={alt} className={className} />,
}))

vi.mock('framer-motion', () => ({
    motion: {
        button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
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

const baseMonster: Monster = {
    _id: 'monster-1',
    id: 'monster-1',
    name: 'Adult Silver Dragon',
    originalName: 'Adult Silver Dragon',
    source: 'MM',
    description: 'Descrição',
    image: '',
    status: 'active',
    type: 'dragon',
    size: 'L',
    alignment: 'CE',
    armorClass: 19,
    hitPointsFormula: '20d10 + 100',
    speed: '12m',
    attributes: { strength: 20, dexterity: 10, constitution: 18, intelligence: 14, wisdom: 12, charisma: 16 },
    savingThrows: {},
    skills: {},
    senses: {},
    sensesAndLanguages: [],
    challengeRating: '5',
    languages: 'Dracônico',
    damageVulnerabilities: [],
    damageResistances: [],
    damageImmunities: [],
    conditionImmunities: [],
    traits: [],
    actions: [],
    bonusActions: [],
    reactions: [],
    legendaryActions: [],
    lairActions: [],
    regionalEffects: [],
    createdAt: '',
    updatedAt: '',
}

const intersectionObservers: Array<{ trigger: (isIntersecting: boolean) => void; observe: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }> = []

describe('MonstersTable', () => {
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

        vi.stubGlobal(
            'IntersectionObserver',
            MockIntersectionObserver,
        )
    })

    afterAll(() => {
        vi.unstubAllGlobals()
    })

    it('renders the monster image when available and shows the derived hit point average', () => {
        render(<MonstersTable items={[{ ...baseMonster, image: '/adult-silver-dragon.png' }]} />)

        expect(screen.getByRole('img', { name: 'Adult Silver Dragon' })).toHaveAttribute('src', '/adult-silver-dragon.png')
        expect(screen.getByText('CA')).toBeInTheDocument()
        expect(screen.getByText('PV')).toBeInTheDocument()
        expect(screen.queryByText('CA/PV')).not.toBeInTheDocument()
        expect(screen.getByText('19')).toBeInTheDocument()
        expect(screen.getByText('210')).toBeInTheDocument()
        expect(screen.getByText('20d10 + 100')).toBeInTheDocument()
    })

    it('links the monster name cell to the monster detail page', () => {
        render(<MonstersTable items={[baseMonster]} />)

        expect(screen.getByRole('link', { name: 'Adult Silver Dragon' })).toHaveAttribute('href', '/monsters/adult-silver-dragon')
    })

    it('keeps inactive monsters visually muted while linking to details', () => {
        render(<MonstersTable items={[{ ...baseMonster, status: 'inactive' }]} />)

        expect(screen.getByRole('link', { name: 'Adult Silver Dragon' })).toHaveClass('text-white/30')
    })

    it('keeps the stored number when hit points are already a static average', () => {
        render(<MonstersTable items={[{ ...baseMonster, hitPointsFormula: '42' }]} />)

        expect(screen.getByText('42')).toBeInTheDocument()
        expect(screen.queryByText('20d10 + 100')).not.toBeInTheDocument()
    })

    it('rounds derived hit point averages down in the pv column', () => {
        render(<MonstersTable items={[{ ...baseMonster, hitPointsFormula: '3d8 - 3' }]} />)

        expect(screen.getByText('10')).toBeInTheDocument()
        expect(screen.getByText('3d8 - 3')).toBeInTheDocument()
        expect(screen.queryByText('10.5')).not.toBeInTheDocument()
    })

    it('renders initial loading and empty states', () => {
        const { rerender } = render(<MonstersTable items={[]} isLoading />)

        expect(screen.getAllByText('Carregando monstros...')[0]).toBeInTheDocument()

        rerender(<MonstersTable items={[]} isLoading={false} />)

        expect(screen.getByText('Nenhum monstro encontrado')).toBeInTheDocument()
        expect(screen.getByText('Tente ajustar os filtros.')).toBeInTheDocument()
    })

    it('loads the next page when the table sentinel intersects', () => {
        const onLoadMore = vi.fn()
        render(<MonstersTable items={[baseMonster]} hasNextPage onLoadMore={onLoadMore} />)

        act(() => {
            intersectionObservers[0].trigger(true)
        })

        expect(onLoadMore).toHaveBeenCalledTimes(1)
    })

    it('renders the AI generation action for admins', () => {
        const onGenerateAI = vi.fn()

        render(<MonstersTable items={[baseMonster]} isAdmin onGenerateAI={onGenerateAI} />)

        fireEvent.click(screen.getByText('Gerar com IA'))

        expect(onGenerateAI).toHaveBeenCalledWith(baseMonster)
    })

    it('does not load more without a next page or while fetching', () => {
        const onLoadMore = vi.fn()
        const { rerender } = render(<MonstersTable items={[baseMonster]} hasNextPage={false} onLoadMore={onLoadMore} />)

        act(() => {
            intersectionObservers[0].trigger(true)
        })

        expect(onLoadMore).not.toHaveBeenCalled()

        rerender(<MonstersTable items={[baseMonster]} hasNextPage onLoadMore={onLoadMore} isFetchingNextPage />)

        expect(onLoadMore).not.toHaveBeenCalled()
    })
})
