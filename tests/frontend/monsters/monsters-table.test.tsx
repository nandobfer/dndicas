import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
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

describe('MonstersTable', () => {
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
})
