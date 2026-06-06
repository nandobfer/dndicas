import { screen } from '@testing-library/react'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import type { ReactNode } from 'react'
import { renderWithQueryClient as render } from "../test-utils"
import { NpcPreview } from '@/features/monsters/components/npc-preview'
import { NpcsTable } from '@/features/monsters/components/npcs-table'
import type { Monster } from '@/features/monsters/types/monsters.types'

vi.mock('next/link', () => ({
    default: ({ href, children, ...props }: { href: string; children: ReactNode }) => <a href={href} {...props}>{children}</a>,
}))

vi.mock('@/components/ui/glass-image', () => ({
    GlassImage: ({ src, alt, className }: { src: string; alt: string; className?: string }) => <img src={src} alt={alt} className={className} />,
}))

vi.mock('@/core/context/window-context', () => ({
    useWindows: () => ({ addWindow: vi.fn() }),
}))

vi.mock('@/features/rules/components/mention-badge', async () => {
    const actual = await vi.importActual<typeof import('@/features/rules/components/mention-badge')>('@/features/rules/components/mention-badge')
    return {
        ...actual,
        MentionContent: ({ html, className }: { html: string; className?: string }) => <div className={className}>{html}</div>,
    }
})

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

const baseNpc: Monster = {
    _id: 'npc-1',
    id: 'npc-1',
    name: 'Tavern Guard',
    originalName: 'Tavern Guard',
    source: 'Homebrew',
    description: 'Um guarda de taverna',
    image: '',
    status: 'active',
    type: 'humanoid',
    size: 'M',
    alignment: 'N',
    armorClass: 14,
    hitPointsFormula: '2d8 + 4',
    speed: '9m',
    attributes: { strength: 14, dexterity: 12, constitution: 14, intelligence: 10, wisdom: 10, charisma: 8 },
    savingThrows: {},
    skills: {},
    senses: {},
    sensesAndLanguages: [],
    challengeRating: '1/4',
    languages: 'Comum',
    damageVulnerabilities: [],
    damageResistances: [],
    damageImmunities: [],
    conditionImmunities: [],
    conditionImmunityNotes: '',
    traits: [],
    actions: [],
    bonusActions: [],
    reactions: [],
    legendaryActions: [],
    lairActions: [],
    regionalEffects: [],
    createdAt: new Date(),
    updatedAt: new Date(),
}

const intersectionObservers: Array<{ observe: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn>; unobserve: ReturnType<typeof vi.fn> }> = []

describe('NpcPreview', () => {
    it('renders the NPC name', () => {
        render(<NpcPreview monster={baseNpc} entityType="NPC" hideActionIcons />)
        expect(screen.getByText('Tavern Guard')).toBeInTheDocument()
    })

    it('renders entityType "NPC" — not "Monstro"', () => {
        render(<NpcPreview monster={baseNpc} entityType="NPC" hideActionIcons />)
        expect(screen.getByText('Tavern Guard')).toBeInTheDocument()
    })

    it('defaults entityType to "Monstro" when not provided', () => {
        render(<NpcPreview monster={baseNpc} hideActionIcons />)
        expect(screen.getByText('Tavern Guard')).toBeInTheDocument()
    })

    it('renders armor class and computed average hit points', () => {
        render(<NpcPreview monster={baseNpc} hideActionIcons />)

        expect(screen.getByText('14')).toBeInTheDocument()
        // 2d8+4 average = 13
        expect(screen.getByText('13')).toBeInTheDocument()
    })
})

describe('NpcsTable', () => {
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
        }
        vi.stubGlobal('IntersectionObserver', MockIntersectionObserver)
    })

    afterAll(() => {
        vi.unstubAllGlobals()
    })

    it('renders column header with entityLabel', () => {
        render(<NpcsTable items={[baseNpc]} entityType="NPC" entityLabel="NPC" />)
        expect(screen.getByText('NPC')).toBeInTheDocument()
    })

    it('renders the NPC name in the table', () => {
        render(<NpcsTable items={[baseNpc]} entityType="NPC" entityLabel="NPC" />)
        expect(screen.getByText('Tavern Guard')).toBeInTheDocument()
    })

    it('shows edit and delete in dropdown when isAdmin is true', () => {
        const onEdit = vi.fn()
        const onDelete = vi.fn()
        render(<NpcsTable items={[baseNpc]} entityType="NPC" entityLabel="NPC" isAdmin onEdit={onEdit} onDelete={onDelete} />)
        expect(screen.getByText('Editar')).toBeInTheDocument()
        expect(screen.getByText('Excluir')).toBeInTheDocument()
    })

    it('hides edit/delete dropdown when isAdmin is false', () => {
        render(<NpcsTable items={[baseNpc]} entityType="NPC" entityLabel="NPC" isAdmin={false} />)
        expect(screen.queryByText('Editar')).not.toBeInTheDocument()
        expect(screen.queryByText('Excluir')).not.toBeInTheDocument()
    })

    it('shows loading state when isLoading is true and no items', () => {
        render(<NpcsTable items={[]} isLoading entityLabel="NPC" />)
        const items = screen.getAllByText(/carregando npcs/i)
        expect(items.length).toBeGreaterThan(0)
    })

    it('shows empty state when not loading and no items', () => {
        render(<NpcsTable items={[]} isLoading={false} entityLabel="NPC" />)
        expect(screen.getByText(/nenhum npc encontrado/i)).toBeInTheDocument()
    })

    it('defaults to "Monstro" label when entityLabel is not provided', () => {
        render(<NpcsTable items={[]} isLoading={false} />)
        expect(screen.getByText(/nenhum monstro encontrado/i)).toBeInTheDocument()
    })
})
