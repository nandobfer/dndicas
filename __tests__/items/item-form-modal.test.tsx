import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { Controller } from 'react-hook-form'
import { ItemFormModal } from '@/features/items/components/item-form-modal'

const createItemMutateAsync = jest.fn().mockResolvedValue(undefined)
const updateItemMutateAsync = jest.fn().mockResolvedValue(undefined)

jest.mock('@/features/items/api/items-queries', () => ({
    useCreateItem: () => ({ isPending: false, mutateAsync: createItemMutateAsync }),
    useUpdateItem: () => ({ isPending: false, mutateAsync: updateItemMutateAsync }),
}))

jest.mock('@/features/classes/components/shared-form-components', () => ({
    ImageAndDescriptionSection: ({
        control,
        descriptionFieldName,
        placeholder,
        isSubmitting,
    }: {
        control: any
        descriptionFieldName: string
        placeholder?: string
        isSubmitting?: boolean
    }) => (
        <Controller
            name={descriptionFieldName}
            control={control}
            render={({ field }) => (
                <textarea
                    data-testid="item-description-editor"
                    value={field.value || ''}
                    onChange={(e) => field.onChange(e.target.value)}
                    placeholder={placeholder}
                    disabled={isSubmitting}
                />
            )}
        />
    ),
}))

jest.mock('@/features/items/components/shared/entity-list-chooser', () => ({
    EntityListChooser: () => <div data-testid="entity-list-chooser" />,
}))

jest.mock('@/core/hooks/useMediaQuery', () => ({
    useIsMobile: () => false,
}))

jest.mock('sonner', () => ({
    toast: {
        success: jest.fn(),
        error: jest.fn(),
    },
}))

jest.mock('@/core/context/window-context', () => ({
    useWindows: () => ({ addWindow: jest.fn() }),
}))

jest.mock('@clerk/nextjs', () => ({
    useUser: () => ({ user: null, isLoaded: true }),
    useAuth: () => ({ userId: null }),
}))

jest.mock('framer-motion', () => {
    const actual = jest.requireActual('framer-motion')
    const MockDiv = ({ children, layoutId, initial, animate, exit, transition, ...props }: React.HTMLAttributes<HTMLDivElement> & { children?: React.ReactNode; layoutId?: string }) => (
        <div {...props}>{children}</div>
    )
    const MockButton = ({ children, layoutId, initial, animate, exit, transition, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { children?: React.ReactNode; layoutId?: string }) => (
        <button {...props}>{children}</button>
    )
    return {
        ...actual,
        AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
        motion: {
            div: MockDiv,
            button: MockButton,
        },
    }
})

describe('ItemFormModal — charges behavior', () => {
    beforeEach(() => {
        createItemMutateAsync.mockClear()
        updateItemMutateAsync.mockClear()
    })

    it('submits with charges undefined when creating without touching the selector', async () => {
        render(<ItemFormModal item={null} isOpen={true} onClose={jest.fn()} onSuccess={jest.fn()} />)

        fireEvent.change(screen.getByPlaceholderText('Ex: Espada Longa +1'), { target: { value: 'Item Teste' } })
        fireEvent.change(screen.getByPlaceholderText('Ex: PHB pg. 150'), { target: { value: 'LDJ pág. 1' } })
        fireEvent.change(screen.getByTestId('item-description-editor'), { target: { value: 'Descrição de teste com mais de dez caracteres.' } })

        fireEvent.submit(screen.getByPlaceholderText('Ex: Espada Longa +1').closest('form')!)

        await waitFor(() => {
            expect(createItemMutateAsync).toHaveBeenCalledWith(
                expect.objectContaining({
                    name: 'Item Teste',
                    charges: undefined,
                }),
            )
        })
    })

    it('preserves existing charges when editing', async () => {
        const item = {
            _id: '1',
            id: '1',
            name: 'Item Editado',
            description: 'Descrição existente com mais de dez caracteres.',
            charges: { mode: 'fixed' as const, value: '5' },
            source: 'LDJ',
            status: 'active' as const,
            image: '',
            isMagic: false,
            type: 'qualquer' as const,
            rarity: 'comum' as const,
            traits: [],
            createdAt: '',
            updatedAt: '',
        }

        render(<ItemFormModal item={item} isOpen={true} onClose={jest.fn()} onSuccess={jest.fn()} />)

        fireEvent.submit(screen.getByPlaceholderText('Ex: Espada Longa +1').closest('form')!)

        await waitFor(() => {
            expect(updateItemMutateAsync).toHaveBeenCalledWith({
                id: '1',
                data: expect.objectContaining({
                    charges: { mode: 'fixed', value: '5' },
                }),
            })
        })
    })
})
