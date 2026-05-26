import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { Controller } from 'react-hook-form'
import { describe, expect, it, beforeEach, vi } from 'vitest'
import { MonsterFormModal } from '@/features/monsters/components/monster-form-modal'
import { getMonsterProficiencyBonus, getMonsterXp } from '@/features/monsters/utils/monster-calculations'

const createMonsterMutateAsync = vi.fn().mockResolvedValue(undefined)
const updateMonsterMutateAsync = vi.fn().mockResolvedValue(undefined)

vi.mock('@/features/monsters/api/monsters-queries', () => ({
    useCreateMonster: () => ({ isPending: false, mutateAsync: createMonsterMutateAsync }),
    useUpdateMonster: () => ({ isPending: false, mutateAsync: updateMonsterMutateAsync }),
}))

vi.mock('@/features/classes/components/shared-form-components', () => ({
    ImageAndDescriptionSection: ({ control, descriptionFieldName }: { control: any; descriptionFieldName: string }) => (
        <Controller
            name={descriptionFieldName}
            control={control}
            render={({ field }) => <textarea data-testid="monster-description-editor" value={field.value || ''} onChange={(event) => field.onChange(event.target.value)} />}
        />
    ),
}))

vi.mock('@/features/rules/components/rich-text-editor', () => ({
    RichTextEditor: ({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder?: string }) => (
        <textarea data-testid="npc-param-editor" value={value || ''} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    ),
}))

vi.mock('@/components/ui/glass-tooltip', () => ({
    SimpleGlassTooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('@/features/character-sheets/components/compact-rich-input', () => ({
    CompactRichInput: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => (
        <textarea data-testid="condition-notes" value={value || ''} onChange={(event) => onChange(event.target.value)} />
    ),
}))

vi.mock('@/core/hooks/useMediaQuery', () => ({
    useIsMobile: () => false,
}))

vi.mock('sonner', () => ({
    toast: { success: vi.fn(), error: vi.fn() },
}))

vi.mock('framer-motion', async () => {
    const actual = await vi.importActual<typeof import('framer-motion')>('framer-motion')
    const MockDiv = ({ children, ...props }: any) => <div {...props}>{children}</div>
    const MockButton = ({ children, ...props }: any) => <button {...props}>{children}</button>
    const MockSpan = ({ children, ...props }: any) => <span {...props}>{children}</span>
    return {
        ...actual,
        AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
        motion: { div: MockDiv, button: MockButton, span: MockSpan },
    }
})

describe('MonsterFormModal', () => {
    beforeEach(() => {
        createMonsterMutateAsync.mockClear()
        updateMonsterMutateAsync.mockClear()
    })

    it('submits a valid minimal monster with derived experience', async () => {
        render(<MonsterFormModal monster={null} isOpen={true} onClose={vi.fn()} onSuccess={vi.fn()} />)

        expect(screen.getByLabelText('Challenge Rating')).toHaveValue('')
        fireEvent.change(screen.getByPlaceholderText('Ex: Dragão Vermelho Adulto'), { target: { value: 'Lobo Teste' } })
        fireEvent.change(screen.getByTestId('monster-description-editor'), { target: { value: 'Descrição de monstro válida para teste.' } })
        fireEvent.submit(screen.getByPlaceholderText('Ex: Dragão Vermelho Adulto').closest('form')!)

        await waitFor(() => {
            expect(createMonsterMutateAsync).toHaveBeenCalledWith(expect.objectContaining({
                name: 'Lobo Teste',
                challengeRating: '0',
                experience: 10,
            }))
        })
    })

    it('submits a filled challenge rating with derived experience', async () => {
        render(<MonsterFormModal monster={null} isOpen={true} onClose={vi.fn()} onSuccess={vi.fn()} />)

        fireEvent.change(screen.getByPlaceholderText('Ex: Dragão Vermelho Adulto'), { target: { value: 'Lobo Forte' } })
        fireEvent.change(screen.getByTestId('monster-description-editor'), { target: { value: 'Descrição de monstro válida para teste.' } })
        fireEvent.change(screen.getByLabelText('Challenge Rating'), { target: { value: '5' } })
        fireEvent.submit(screen.getByPlaceholderText('Ex: Dragão Vermelho Adulto').closest('form')!)

        await waitFor(() => {
            expect(createMonsterMutateAsync).toHaveBeenCalledWith(expect.objectContaining({
                name: 'Lobo Forte',
                challengeRating: '5',
                experience: 1800,
            }))
        })
    })

    it('masks numeric combat fields immediately', () => {
        render(<MonsterFormModal monster={null} isOpen={true} onClose={vi.fn()} onSuccess={vi.fn()} />)

        fireEvent.change(screen.getByLabelText('CA'), { target: { value: 'a1b2' } })
        fireEvent.change(screen.getByLabelText('Iniciativa'), { target: { value: 'x-3y' } })
        fireEvent.change(screen.getByLabelText('Proficiência'), { target: { value: 'p4q' } })
        fireEvent.change(screen.getByLabelText('XP Override'), { target: { value: '9xp0' } })
        fireEvent.change(screen.getByLabelText('Challenge Rating'), { target: { value: 'a1/4-b' } })

        expect(screen.getByLabelText('CA')).toHaveValue('12')
        expect(screen.getByLabelText('Iniciativa')).toHaveValue('-3')
        expect(screen.getByLabelText('Proficiência')).toHaveValue('4')
        expect(screen.getByLabelText('XP Override')).toHaveValue('90')
        expect(screen.getByLabelText('Challenge Rating')).toHaveValue('1/4-')
    })

    it('adds optional speed fields as empty inputs', () => {
        render(<MonsterFormModal monster={null} isOpen={true} onClose={vi.fn()} onSuccess={vi.fn()} />)

        fireEvent.click(screen.getByRole('button', { name: 'Adicionar Voo' }))
        fireEvent.click(screen.getByRole('button', { name: 'Adicionar Nado' }))
        fireEvent.click(screen.getByRole('button', { name: 'Adicionar Escalada' }))

        expect(screen.getByLabelText('Voo')).toHaveValue('')
        expect(screen.getByLabelText('Nado')).toHaveValue('')
        expect(screen.getByLabelText('Escalada')).toHaveValue('')
    })

    it('preserves npc params when editing', async () => {
        const monster = {
            _id: 'monster-1',
            id: 'monster-1',
            name: 'Gárgula',
            source: 'LDM pág. 1',
            description: 'Descrição existente de monstro.',
            image: '',
            status: 'active' as const,
            type: 'elemental' as const,
            size: 'M' as const,
            alignment: 'CE' as const,
            armorClass: 15,
            hitPointsFormula: '7d8 + 21',
            speed: '9 m',
            attributes: { strength: 15, dexterity: 11, constitution: 16, intelligence: 6, wisdom: 11, charisma: 7 },
            savingThrows: {},
            skills: {},
            senses: {},
            sensesAndLanguages: [],
            challengeRating: '2' as const,
            languages: 'Terran',
            damageVulnerabilities: [],
            damageResistances: [],
            damageImmunities: [],
            conditionImmunities: [],
            traits: [],
            actions: [{ label: 'Garras', description: 'Ataque com garras.', attackRoll: 4, hitRoll: '2d6 + 2 cortante' }],
            bonusActions: [],
            reactions: [],
            legendaryActions: [],
            lairActions: [],
            regionalEffects: [],
            createdAt: '',
            updatedAt: '',
        }

        render(<MonsterFormModal monster={monster} isOpen={true} onClose={vi.fn()} onSuccess={vi.fn()} />)
        fireEvent.submit(screen.getByPlaceholderText('Ex: Dragão Vermelho Adulto').closest('form')!)

        await waitFor(() => {
            expect(updateMonsterMutateAsync).toHaveBeenCalledWith({
                id: 'monster-1',
                data: expect.objectContaining({
                    actions: [expect.objectContaining({ label: 'Garras', attackRoll: 4, hitRoll: '2d6 + 2 cortante' })],
                }),
            })
        })
    })
})

describe('monster calculations', () => {
    it('derives XP and proficiency from CR, with overrides', () => {
        expect(getMonsterXp('5')).toBe(1800)
        expect(getMonsterXp('5', 2000)).toBe(2000)
        expect(getMonsterProficiencyBonus('16')).toBe(5)
        expect(getMonsterProficiencyBonus('16', 8)).toBe(8)
        expect(getMonsterProficiencyBonus('1/4-')).toBe(2)
    })
})
