"use client"

import { useId, useMemo, useState, type KeyboardEvent, type ReactElement, type ReactNode } from "react"
import Fuse, { type FuseOptionKey } from "fuse.js"
import { AnimatePresence, motion } from "framer-motion"
import { Loader2, Search } from "lucide-react"
import { Input } from "@/components/ui/opex/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/opex/popover"
import { cn } from "@/lib/utils"

const MAX_VISIBLE = 100

export interface SearchPickerProps<T> {
    /** Elemento que abre a busca (botão ou campo); recebe o estado aberto/fechado do popover. */
    trigger: ReactElement
    items: readonly T[]
    getKey: (item: T) => string
    /** Conteúdo da opção (foto, nome, preço...). */
    renderItem: (item: T) => ReactNode
    onPick: (item: T) => void
    /**
     * Busca LOCAL (fuse.js, tolera erro de digitação) nestes campos. Sem `searchKeys`, a lista não é
     * filtrada aqui: use `onSearchChange` para buscar no servidor.
     */
    searchKeys?: FuseOptionKey<T>[]
    /** Filtro local próprio (ex.: trecho sem acento), no lugar da busca tolerante do fuse.js. */
    filterItems?: (items: readonly T[], term: string) => T[]
    /**
     * Ordena as opções ANTES da busca (ex.: repositórios usados recentemente primeiro). Sem termo,
     * essa é a ordem da lista; com termo, o fuse.js reordena por relevância e a ordenação de entrada
     * decide os empates. Memoize a função para não recriar o índice a cada render.
     */
    orderItems?: (items: readonly T[]) => T[]
    onSearchChange?: (term: string) => void
    onOpenChange?: (open: boolean) => void
    /**
     * Ao fechar, recebe o evento de restauração de foco no gatilho. Ex.: quem escolheu um item e vai
     * devolver o foco para outro campo chama `event.preventDefault()` para o gatilho não retomá-lo.
     */
    onCloseAutoFocus?: (event: Event) => void
    /** Motivo do bloqueio (vira dica da opção) ou `false` quando a opção pode ser escolhida. */
    disabledReason?: (item: T) => string | false
    loading?: boolean
    fetching?: boolean
    disabled?: boolean
    placeholder?: string
    searchLabel: string
    listLabel: string
    emptyText: string
    emptySearchText: string
    loadingText?: string
    align?: "start" | "center" | "end"
    /** Popover na largura do gatilho (campo de largura total) em vez de largura fixa. */
    matchTriggerWidth?: boolean
    /** Conteúdo fixo abaixo da lista (ex.: link "Ver todas"). */
    footer?: ReactNode
    /** Classe do popover (largura). */
    contentClassName?: string
}

/**
 * Busca com lista em popover para escolher UM item de uma lista grande (produto, oferta, item da
 * oferta): campo de busca, opções ricas com entrada/saída animadas, ↑/↓ + Enter para escolher e
 * Esc para fechar. Fecha e limpa a busca ao escolher. A ordem das opções é a recebida, salvo
 * `orderItems` (ex.: uso recente).
 */
export function SearchPicker<T>({
    trigger,
    items,
    getKey,
    renderItem,
    onPick,
    searchKeys,
    filterItems,
    orderItems,
    onSearchChange,
    onOpenChange,
    onCloseAutoFocus,
    disabledReason,
    loading,
    fetching,
    disabled,
    placeholder = "Buscar...",
    searchLabel,
    listLabel,
    emptyText,
    emptySearchText,
    loadingText = "Carregando…",
    align = "start",
    matchTriggerWidth,
    footer,
    contentClassName,
}: SearchPickerProps<T>) {
    const listId = useId()
    const [open, setOpen] = useState(false)
    const [term, setTerm] = useState("")
    const [active, setActive] = useState(-1)
    const ordered = useMemo(() => (orderItems ? orderItems(items) : items), [items, orderItems])
    const fuse = useMemo(() => (searchKeys ? new Fuse([...ordered], { keys: searchKeys, threshold: 0.35, ignoreLocation: true }) : null), [ordered, searchKeys])
    const query = term.trim()
    const visible = useMemo(() => {
        if (filterItems) return filterItems(ordered, query).slice(0, MAX_VISIBLE)
        return (fuse && query ? fuse.search(query).map((result) => result.item) : [...ordered]).slice(0, MAX_VISIBLE)
    }, [filterItems, fuse, ordered, query])

    const changeTerm = (next: string) => {
        setTerm(next)
        setActive(-1)
        onSearchChange?.(next)
    }
    const changeOpen = (next: boolean) => {
        setOpen(next)
        setActive(-1)
        if (!next) changeTerm("")
        onOpenChange?.(next)
    }
    const pick = (item: T) => {
        if (disabledReason?.(item)) return
        onPick(item)
        changeOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.nativeEvent.isComposing || loading || fetching || disabled) return
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault()
            if (visible.length === 0) return
            const step = event.key === "ArrowDown" ? 1 : -1
            setActive((current) => (current + step + visible.length) % visible.length)
        } else if (event.key === "Enter") {
            event.preventDefault()
            const available = visible.filter((item) => !disabledReason?.(item))
            const item = visible[active] ?? (query || available.length === 1 ? available[0] : undefined)
            if (item) pick(item)
        }
    }
    const optionDomId = (index: number) => `${listId}-opt-${index}`

    return (
        <Popover open={open} onOpenChange={changeOpen}>
            <PopoverTrigger asChild disabled={disabled}>
                {trigger}
            </PopoverTrigger>
            <PopoverContent align={align} onCloseAutoFocus={onCloseAutoFocus} className={cn("p-0", matchTriggerWidth ? "w-[var(--radix-popover-trigger-width)] min-w-[min(420px,calc(100vw-2rem))]" : "w-[min(420px,calc(100vw-2rem))]", contentClassName)}>
                <div className="flex items-center gap-2 border-b px-3">
                    <Search className="h-4 w-4 text-muted-foreground" aria-hidden />
                    <Input
                        value={term}
                        onChange={(event) => changeTerm(event.target.value)}
                        onKeyDown={onKeyDown}
                        placeholder={placeholder}
                        className="border-0 px-0 shadow-none focus-visible:ring-0"
                        aria-label={searchLabel}
                        aria-controls={listId}
                        aria-activedescendant={active >= 0 ? optionDomId(active) : undefined}
                        autoFocus
                    />
                    {fetching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden />}
                </div>
                <ul id={listId} className="max-h-72 overflow-y-auto p-1" role="listbox" aria-label={listLabel}>
                    <AnimatePresence initial={false}>
                        {visible.map((item, index) => {
                            const reason = disabledReason?.(item) || undefined
                            return (
                                <motion.li key={getKey(item)} layout="position" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}>
                                    <button
                                        type="button"
                                        id={optionDomId(index)}
                                        role="option"
                                        aria-selected={index === active}
                                        aria-disabled={reason ? true : undefined}
                                        disabled={Boolean(reason)}
                                        title={reason}
                                        onMouseEnter={() => setActive(index)}
                                        onClick={() => pick(item)}
                                        className={cn(
                                            "flex w-full items-center gap-3 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted",
                                            index === active && "bg-muted",
                                            reason && "cursor-not-allowed opacity-50 hover:bg-transparent",
                                        )}
                                    >
                                        {renderItem(item)}
                                    </button>
                                </motion.li>
                            )
                        })}
                    </AnimatePresence>
                    {!loading && visible.length === 0 && <li className="px-2 py-6 text-center text-sm text-muted-foreground">{query ? emptySearchText : emptyText}</li>}
                    {loading && <li className="px-2 py-6 text-center text-sm text-muted-foreground">{loadingText}</li>}
                </ul>
                {footer && <div className="border-t p-1">{footer}</div>}
            </PopoverContent>
        </Popover>
    )
}
