/**
 * @fileoverview Custom hook for managing spell filters with URL sync and debouncing.
 *
 * @see specs/004-spells-catalog/spec.md - FR-004, FR-005
 */

"use client";

import { useState, useMemo, useCallback, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useDebounce } from '@/core/hooks/useDebounce';
import type { SpellsFilters, SpellSchool, AttributeType, DiceType } from '../types/spells.types';

export interface UseSpellFiltersReturn {
  /** Current filter state */
  filters: SpellsFilters & { page: number; limit: number };
  /** Search text (non-debounced for input value) */
  search: string;
  /** Debounced search text (for API calls) */
  debouncedSearch: string;
  /** Current page number */
  page: number;
  /** Items per page */
  limit: number;
  /** Circle mode - "exact" matches only selected circle, "upTo" matches 0 to selected circle */
  circleMode: 'exact' | 'upTo';
  /** Update search text */
  setSearch: (value: string) => void;
  /** Update status filter */
  setStatus: (status: SpellsFilters['status']) => void;
  /** Update circles filter */
  setCircles: (circles: number[]) => void;
  /** Update schools filter */
  setSchools: (schools: SpellSchool[]) => void;
  /** Update save attributes filter */
  setSaveAttributes: (attributes: AttributeType[]) => void;
  /** Update dice types filter */
  setDiceTypes: (types: DiceType[]) => void;
  /** Update circle mode */
  setCircleMode: (mode: 'exact' | 'upTo') => void;
  /** Update page number */
  setPage: (page: number) => void;
  /** Update limit */
  setLimit: (limit: number) => void;
  /** Reset all filters to defaults */
  resetFilters: () => void;
}

const DEFAULT_LIMIT = 10;
const SEARCH_DEBOUNCE_MS = 300; // 300ms as per T024 requirement

/**
 * Custom hook for managing spell filters with URL synchronization.
 *
 * Features:
 * - Search text debouncing (300ms)
 * - Pagination state management
 * - URL query parameter sync (future enhancement)
 * - Auto-reset page to 1 when filters change
 *
 * @example
 * ```tsx
 * const {
 *   filters,
 *   search,
 *   setSearch,
 *   setPage,
 *   resetFilters
 * } = useSpellFilters();
 *
 * const { data } = useSpells(filters, filters.page, filters.limit);
 * ```
 */
export function useSpellFilters(): UseSpellFiltersReturn {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Initialize from URL or defaults
  const [page, setPageState] = useState(() => {
    const pageParam = searchParams.get('page');
    return pageParam ? parseInt(pageParam, 10) : 1;
  });

  const [limit] = useState(DEFAULT_LIMIT);
  
  const [search, setSearchState] = useState(() => {
    return searchParams.get('search') || '';
  });

  const [status, setStatusState] = useState<SpellsFilters['status']>(() => {
    const statusParam = searchParams.get('status');
    return (statusParam as SpellsFilters['status']) || 'all';
  });

  // Advanced filters state
  const [circles, setCirclesState] = useState<number[]>(() => {
    const circlesParam = searchParams.get('circles');
    return circlesParam ? circlesParam.split(',').map(Number) : [];
  });

  const [schools, setSchoolsState] = useState<SpellSchool[]>(() => {
    const schoolsParam = searchParams.get('schools');
    return schoolsParam ? (schoolsParam.split(',') as SpellSchool[]) : [];
  });

  const [saveAttributes, setSaveAttributesState] = useState<AttributeType[]>(() => {
    const attributesParam = searchParams.get('attributes');
    return attributesParam ? (attributesParam.split(',') as AttributeType[]) : [];
  });

  const [diceTypes, setDiceTypesState] = useState<DiceType[]>(() => {
    const diceParam = searchParams.get('dice');
    return diceParam ? (diceParam.split(',') as DiceType[]) : [];
  });

  const [circleMode, setCircleModeState] = useState<'exact' | 'upTo'>(() => {
    const modeParam = searchParams.get('circleMode');
    return (modeParam as 'exact' | 'upTo') || 'exact';
  });

  // Debounced search for API calls
  const debouncedSearch = useDebounce(search, SEARCH_DEBOUNCE_MS);

  // Update search and reset page
  const setSearch = useCallback((value: string) => {
    setSearchState(value);
    setPageState(1); // Reset to first page on search
  }, []);

  // Update status and reset page
  const setStatus = useCallback((value: SpellsFilters['status']) => {
    setStatusState(value);
    setPageState(1);
  }, []);

  // Update circles and reset page
  const setCircles = useCallback((value: number[]) => {
    setCirclesState(value);
    setPageState(1);
  }, []);

  // Update schools and reset page
  const setSchools = useCallback((value: SpellSchool[]) => {
    setSchoolsState(value);
    setPageState(1);
  }, []);

  // Update save attributes and reset page
  const setSaveAttributes = useCallback((value: AttributeType[]) => {
    setSaveAttributesState(value);
    setPageState(1);
  }, []);

  // Update dice types and reset page
  const setDiceTypes = useCallback((value: DiceType[]) => {
    setDiceTypesState(value);
    setPageState(1);
  }, []);

  // Update circle mode
  const setCircleMode = useCallback((mode: 'exact' | 'upTo') => {
    setCircleModeState(mode);
    setPageState(1);
  }, []);

  // Update page number
  const setPage = useCallback((newPage: number) => {
    setPageState(newPage);
  }, []);

  // Set limit (not currently used but kept for flexibility)
  const setLimit = useCallback(() => {
    // Limit is fixed for now, but kept for future use
  }, []);

  // Reset all filters
  const resetFilters = useCallback(() => {
    setSearchState('');
    setStatusState('all');
    setCirclesState([]);
    setSchoolsState([]);
    setSaveAttributesState([]);
    setDiceTypesState([]);
    setCircleModeState('exact');
    setPageState(1);
  }, []);

  // Build filters object for API
  const filters: SpellsFilters & { page: number; limit: number } = useMemo(
    () => ({
      search: debouncedSearch,
      status,
      circles: circles.length > 0 ? circles : undefined,
      schools: schools.length > 0 ? schools : undefined,
      saveAttributes: saveAttributes.length > 0 ? saveAttributes : undefined,
      diceTypes: diceTypes.length > 0 ? diceTypes : undefined,
      page,
      limit,
    }),
    [debouncedSearch, status, circles, schools, saveAttributes, diceTypes, page, limit]
  );

  // Sync filters to URL query params
  useEffect(() => {
    const params = new URLSearchParams();

    // Add non-default values to URL
    if (search) params.set('search', search);
    if (status && status !== 'all') params.set('status', status);
    if (page > 1) params.set('page', page.toString());
    if (circles.length > 0) params.set('circles', circles.join(','));
    if (schools.length > 0) params.set('schools', schools.join(','));
    if (saveAttributes.length > 0) params.set('attributes', saveAttributes.join(','));
    if (diceTypes.length > 0) params.set('dice', diceTypes.join(','));
    if (circleMode !== 'exact') params.set('circleMode', circleMode);

    const queryString = params.toString();
    const newUrl = queryString ? `?${queryString}` : window.location.pathname;

    // Use shallow routing to update URL without page reload
    router.replace(newUrl, { scroll: false });
  }, [search, status, page, circles, schools, saveAttributes, diceTypes, circleMode, router]);

  return {
    filters,
    search,
    debouncedSearch,
    page,
    limit,
    circleMode,
    setSearch,
    setStatus,
    setCircles,
    setSchools,
    setSaveAttributes,
    setDiceTypes,
    setCircleMode,
    setPage,
    setLimit,
    resetFilters,
  };
}
