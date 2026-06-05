import { screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import type { ReactNode } from 'react'
import { renderWithQueryClient as render } from "../test-utils"
import { MonsterPreview } from '@/features/monsters/components/monster-preview'
import { NpcParamPreview } from '@/features/monsters/components/npc-param-preview'
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

const baseMonster: Monster = {
    _id: 'monster-1',
    id: 'monster-1',
    name: 'Dragão Teste',
    originalName: 'Test Dragon',
    source: 'LDM pág. 1',
    description: 'Descrição do monstro.',
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

describe('MonsterPreview', () => {
    it('links the monster title to the monster detail page', () => {
        render(<MonsterPreview monster={baseMonster} hideActionIcons />)

        expect(screen.getByRole('link', { name: 'Dragão Teste' })).toHaveAttribute('href', '/monsters/drag%C3%A3o-teste')
    })

    it('renders type before size, summary labels inline, CR with XP, and full attribute names', () => {
        render(<MonsterPreview monster={baseMonster} hideActionIcons />)

        expect(screen.getByText('Dragão Grande, Caótico e Mau')).toBeInTheDocument()

        const crCard = screen.getByText('CR').closest('div')?.parentElement?.parentElement
        expect(crCard).toBeInTheDocument()
        expect(within(crCard!).getByText('5')).toBeInTheDocument()
        expect(within(crCard!).getByText('1.800 XP')).toBeInTheDocument()

        const strengthCard = screen.getByText('Força').closest('div')?.parentElement
        expect(strengthCard).toBeInTheDocument()
        expect(within(strengthCard!).getByText('+5')).toBeInTheDocument()
        expect(within(strengthCard!).getByText('(20)')).toBeInTheDocument()
        expect(screen.queryByText('FOR')).not.toBeInTheDocument()
    })

    it('shows the derived hit point average while preserving the original formula', () => {
        render(<MonsterPreview monster={baseMonster} hideActionIcons />)

        const hitPointCard = screen.getByText('PV').closest('div')?.parentElement?.parentElement

        expect(hitPointCard).toBeInTheDocument()
        expect(within(hitPointCard!).getByText('210')).toBeInTheDocument()
        expect(within(hitPointCard!).getByText('20d10 + 100')).toBeInTheDocument()
    })

    it('rounds derived hit point averages down in the preview', () => {
        render(<MonsterPreview monster={{ ...baseMonster, hitPointsFormula: '3d8 - 3' }} hideActionIcons />)

        const hitPointCard = screen.getByText('PV').closest('div')?.parentElement?.parentElement

        expect(hitPointCard).toBeInTheDocument()
        expect(within(hitPointCard!).getByText('10')).toBeInTheDocument()
        expect(within(hitPointCard!).getByText('3d8 - 3')).toBeInTheDocument()
        expect(within(hitPointCard!).queryByText('10.5')).not.toBeInTheDocument()
    })

    it('keeps a numeric hit point value unchanged and renders the image when available', () => {
        render(<MonsterPreview monster={{ ...baseMonster, hitPointsFormula: '42', image: '/dragon.png' }} hideActionIcons />)

        const hitPointCard = screen.getByText('PV').closest('div')?.parentElement?.parentElement

        expect(hitPointCard).toBeInTheDocument()
        expect(within(hitPointCard!).getByText('42')).toBeInTheDocument()
        expect(within(hitPointCard!).queryByText('20d10 + 100')).not.toBeInTheDocument()
        expect(screen.getByRole('img', { name: 'Dragão Teste' })).toHaveAttribute('src', '/dragon.png')
    })

    it('renders defense damage types in Portuguese', () => {
        render(
            <MonsterPreview
                monster={{
                    ...baseMonster,
                    damageVulnerabilities: ['fire'],
                    damageResistances: ['poison', 'fire', 'lightning'],
                    damageImmunities: ['physical'],
                }}
                hideActionIcons
            />,
        )

        const defenses = screen.getByText('Defesas').closest('div')?.parentElement
        expect(defenses).toBeInTheDocument()
        expect(within(defenses!).getAllByText('Fogo')).toHaveLength(2)
        expect(within(defenses!).getByText('Veneno')).toBeInTheDocument()
        expect(within(defenses!).getByText('Elétrico')).toBeInTheDocument()
        expect(within(defenses!).getByText('Físico')).toBeInTheDocument()
        expect(defenses).toHaveTextContent('Resistências: Veneno, Fogo, Elétrico')
        expect(within(defenses!).queryByText('fire')).not.toBeInTheDocument()
        expect(within(defenses!).queryByText('poison')).not.toBeInTheDocument()
        expect(within(defenses!).queryByText('lightning')).not.toBeInTheDocument()
        expect(within(defenses!).queryByText('physical')).not.toBeInTheDocument()
    })
})

describe('NpcParamPreview', () => {
    it('colors damage type words inside the hit roll chip', () => {
        render(<NpcParamPreview param={{ label: 'Mordida', description: 'Ataque.', hitRoll: '1d8 + 3 cortante + 2d6 elétrico' }} />)

        expect(screen.getByText('cortante')).toHaveStyle({ color: '#8c8c8c' })
        expect(screen.getByText('elétrico')).toHaveStyle({ color: '#3366cc' })
    })
})
