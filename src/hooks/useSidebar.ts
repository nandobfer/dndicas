"use client";

/**
 * @fileoverview useSidebar hook for managing sidebar expand/collapse state.
 * Persists state to sessionStorage (per FR-012, clarification session).
 *
 * @example
 * ```tsx
 * const { isExpanded, toggle, expand, collapse } = useSidebar();
 * ```
 */

import { useState, useCallback, useEffect } from 'react';

const STORAGE_KEY = 'sidebar-expanded';

/**
 * Hook for managing sidebar expand/collapse state with sessionStorage persistence.
 * Default state: expanded (per FR-053).
 */
export const useSidebar = () => {
  // Initialize with default value, will sync with storage in useEffect
  const [isExpanded, setIsExpanded] = useState(true);
  const [isHydrated, setIsHydrated] = useState(false);

  // Sync with sessionStorage on mount (client-side only)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const stored = sessionStorage.getItem(STORAGE_KEY);
    // Default is expanded (true) if no stored value
    const initialValue = stored === null ? true : stored === 'true';
    setIsExpanded(initialValue);
    setIsHydrated(true);
  }, []);

  /**
   * Toggle sidebar state between expanded and collapsed.
   */
  const toggle = useCallback(() => {
    setIsExpanded((prev) => {
      const next = !prev;
      if (typeof window !== 'undefined') {
        sessionStorage.setItem(STORAGE_KEY, String(next));
      }
      return next;
    });
  }, []);

  /**
   * Expand the sidebar.
   */
  const expand = useCallback(() => {
    setIsExpanded(true);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(STORAGE_KEY, 'true');
    }
  }, []);

  /**
   * Collapse the sidebar.
   */
  const collapse = useCallback(() => {
    setIsExpanded(false);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(STORAGE_KEY, 'false');
    }
  }, []);

  return {
    /** Whether sidebar is expanded */
    isExpanded,
    /** Whether hydration from storage is complete */
    isHydrated,
    /** Toggle between expanded and collapsed */
    toggle,
    /** Expand the sidebar */
    expand,
    /** Collapse the sidebar */
    collapse,
  };
};

export type UseSidebarReturn = ReturnType<typeof useSidebar>;
