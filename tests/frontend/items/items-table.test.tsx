import { render, screen } from '@testing-library/react'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import type { ReactNode } from 'react'
import { ItemsTable } from '@/features/items/components/items-table'
import type { Item } from '@/features/items/types/items.types'

vi.mock('framer-motion', () => ({
    motion: {
        button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
        div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
    },
}))

vi.mock('@/components/ui/glass-dropdown-menu', () => ({
    GlassDropdownMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    GlassDropdownMenuTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
    GlassDropdownMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    GlassDropdownMenuItem: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
}))

vi.mock('@/components/ui/glass-image', () => ({
    GlassImage: ({ src, alt, className }: { src: string; alt: string; className?: string }) => <img src={src} alt={alt} className={className} />,
}))

const baseItem: Item = {
    _id: 'item-1',
    id: 'item-1',
    name: 'Espada Longa',
    description: '<p>Uma espada.</p>',
    source: 'PHB',
    status: 'active',
    price: '15 po',
    isMagic: false,
    type: 'arma',
    rarity: 'comum',
    traits: [],
    damageDice: { quantidade: 1, tipo: 'd8' },
    damageType: 'cortante',
    createdAt: '',
    updatedAt: '',
}

describe('ItemsTable', () => {
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

    it('renders loading and empty states for table mode', () => {
        const { rerender } = render(<ItemsTable items={[]} isLoading />)

        expect(screen.getByRole('status', { name: 'Carregando itens...' })).toBeInTheDocument()

        rerender(<ItemsTable items={[]} isLoading={false} />)

        expect(screen.getByText('Nenhum item encontrado')).toBeInTheDocument()
        expect(screen.getByText('Tente ajustar os filtros.')).toBeInTheDocument()
    })

    it('renders items with the infinite scroll end state', () => {
        render(<ItemsTable items={[{ ...baseItem, image: '/longsword.png' }]} />)

        expect(screen.getByRole('img', { name: 'Espada Longa' })).toHaveAttribute('src', '/longsword.png')
        expect(screen.getByText('Espada Longa')).toBeInTheDocument()
        expect(screen.getByText('Fim da lista')).toBeInTheDocument()
    })

    it('falls back to the item type icon when there is no image', () => {
        render(<ItemsTable items={[baseItem]} />)

        expect(screen.queryByRole('img', { name: 'Espada Longa' })).not.toBeInTheDocument()
        expect(screen.getByText('Espada Longa')).toBeInTheDocument()
    })
})
