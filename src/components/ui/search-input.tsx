"use client";

/**
 * @fileoverview SearchInput component with debounce and progress indicator.
 * Debounce delay: 500ms as per FR-019.
 *
 * @see specs/000/spec.md - FR-019
 */

import * as React from 'react';
import { cn } from '@/core/utils';
import { Search, X } from 'lucide-react';
import { useDebounce } from '@/core/hooks';
import { motion, AnimatePresence } from 'framer-motion';
import { GlassInput } from "./glass-input"
import { DebounceProgress } from "./debounce-progress"

export interface SearchInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange"> {
    /** Current search value */
    value: string
    /** Callback when debounced value changes */
    onChange: (value: string) => void
    /** Debounce delay in ms (default: 500) */
    debounceMs?: number
    /** Whether search is loading */
    isLoading?: boolean
    /** Whether to show the clear button */
    showClearButton?: boolean
    /** Whether to show the search icon */
    showSearchIcon?: boolean
    /** Custom right element (actions) */
    rightElement?: React.ReactNode
    /** Placeholder text */
    placeholder?: string
}

/**
 * SearchInput with debounce and visual loading indicator.
 *
 * @example
 * ```tsx
 * const [search, setSearch] = useState('');
 * <SearchInput
 *   value={search}
 *   onChange={setSearch}
 *   isLoading={isSearching}
 * />
 * ```
 */
export const SearchInput = React.forwardRef<HTMLInputElement, SearchInputProps>(
    (
        {
            value,
            onChange,
            debounceMs = 500,
            isLoading = false,
            showClearButton = true,
            showSearchIcon = true,
            rightElement,
            placeholder = "Buscar...",
            className,
            ...props
        },
        ref
    ) => {
        const [localValue, setLocalValue] = React.useState(value)
        const [isDebouncing, setIsDebouncing] = React.useState(false)
        const debouncedValue = useDebounce(localValue, debounceMs)

        // Sync external value changes
        React.useEffect(() => {
            setLocalValue(value)
        }, [value])

        // Handle debounced value change
        React.useEffect(() => {
            // Only trigger changes and stop animation when debounced value matches local input
            if (debouncedValue === localValue) {
                if (debouncedValue !== value) {
                    onChange(debouncedValue)
                }
                setIsDebouncing(false)
            }
        }, [debouncedValue, value, onChange, localValue])

        const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
            setLocalValue(e.target.value)
            setIsDebouncing(true)
        }

        const handleClear = (e: React.MouseEvent) => {
            e.preventDefault()
            e.stopPropagation()
            setLocalValue("")
            onChange("")
            setIsDebouncing(false)
        }

        const showLoader = isLoading
        const showClear = showClearButton && localValue.length > 0 && !isLoading

        return (
            <GlassInput
                ref={ref}
                value={localValue}
                onChange={handleChange}
                placeholder={placeholder}
                className={className}
                icon={showSearchIcon ? <Search /> : null}
                rightElement={
                    <div className="flex items-center gap-1">
                        {rightElement}
                        <AnimatePresence mode="wait">
                            {showLoader ? (
                                <motion.div
                                    key="loader"
                                    initial={{ opacity: 0, scale: 0.8 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.8 }}
                                    className="h-4 w-4"
                                >
                                    <svg className="animate-spin text-white/60" viewBox="0 0 24 24" fill="none">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                        <path
                                            className="opacity-75"
                                            fill="currentColor"
                                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                        />
                                    </svg>
                                </motion.div>
                            ) : showClear ? (
                                <motion.button
                                    key="clear"
                                    onClick={handleClear}
                                    className="p-1 hover:bg-white/10 rounded-full transition-colors text-white/40 hover:text-white"
                                    initial={{ opacity: 0, scale: 0.8 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.8 }}
                                >
                                    <X className="h-3.5 w-3.5" />
                                </motion.button>
                            ) : null}
                        </AnimatePresence>
                    </div>
                }
                {...props}
            >
                <DebounceProgress isAnimating={isDebouncing} duration={debounceMs} animationKey={localValue} />
            </GlassInput>
        )
    }
)

SearchInput.displayName = "SearchInput"
