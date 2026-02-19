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
import { glassConfig } from '@/lib/config/glass-config';

export interface SearchInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  /** Current search value */
  value: string;
  /** Callback when debounced value changes */
  onChange: (value: string) => void;
  /** Debounce delay in ms (default: 500) */
  debounceMs?: number;
  /** Whether search is loading */
  isLoading?: boolean;
  /** Placeholder text */
  placeholder?: string;
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
export function SearchInput({
  value,
  onChange,
  debounceMs = 500,
  isLoading = false,
  placeholder = 'Buscar...',
  className,
  ...props
}: SearchInputProps) {
  const [localValue, setLocalValue] = React.useState(value);
  const [isDebouncing, setIsDebouncing] = React.useState(false);
  const debouncedValue = useDebounce(localValue, debounceMs);

  // Sync external value changes
  React.useEffect(() => {
    setLocalValue(value);
  }, [value]);

  // Handle debounced value change
  React.useEffect(() => {
    if (debouncedValue !== value) {
      onChange(debouncedValue);
    }
    setIsDebouncing(false);
  }, [debouncedValue, value, onChange]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalValue(e.target.value);
    setIsDebouncing(true);
  };

  const handleClear = () => {
    setLocalValue('');
    onChange('');
    setIsDebouncing(false);
  };

  const showLoader = isLoading || isDebouncing;
  const showClear = localValue.length > 0;

  return (
    <div className={cn('relative', className)}>
      {/* Search icon */}
      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40">
        <Search className="h-4 w-4" />
      </div>

      {/* Input */}
      <input
        type="text"
        value={localValue}
        onChange={handleChange}
        placeholder={placeholder}
        className={cn(
          'w-full h-10 pl-10 pr-10 rounded-lg text-sm',
          'text-white placeholder:text-white/40',
          'outline-none transition-all',
          glassConfig.input.blur,
          glassConfig.input.background,
          glassConfig.input.border,
          'focus:ring-2 focus:ring-white/20'
        )}
        aria-label="Campo de busca"
        {...props}
      />

      {/* Clear button / Loading indicator */}
      <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center">
        <AnimatePresence mode="wait">
          {showLoader ? (
            <motion.div
              key="loader"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="h-4 w-4"
            >
              <svg
                className="animate-spin text-white/60"
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
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
              type="button"
              onClick={handleClear}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="h-5 w-5 rounded-full flex items-center justify-center text-white/40 hover:text-white/60 hover:bg-white/10 transition-colors"
              aria-label="Limpar busca"
            >
              <X className="h-3 w-3" />
            </motion.button>
          ) : null}
        </AnimatePresence>
      </div>

      {/* Progress bar */}
      <AnimatePresence>
        {showLoader && (
          <motion.div
            initial={{ scaleX: 0, opacity: 0 }}
            animate={{ scaleX: 1, opacity: 1 }}
            exit={{ scaleX: 0, opacity: 0 }}
            transition={{ duration: debounceMs / 1000, ease: 'linear' }}
            className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-400 via-purple-400 to-blue-400 origin-left rounded-b-lg"
          />
        )}
      </AnimatePresence>
    </div>
  );
}
