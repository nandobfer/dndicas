/**
 * @fileoverview Debounce hook for delayed value updates.
 */

import { useState, useEffect } from 'react';

/**
 * Use a debounced version of a value.
 *
 * @param value - The value to debounce
 * @param delay - Debounce delay in milliseconds
 * @returns The debounced value
 *
 * @example
 * ```tsx
 * const [search, setSearch] = useState('');
 * const debouncedSearch = useDebounce(search, 500);
 *
 * useEffect(() => {
 *   // This runs 500ms after the last search change
 *   fetchResults(debouncedSearch);
 * }, [debouncedSearch]);
 * ```
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);

  return debouncedValue;
}
