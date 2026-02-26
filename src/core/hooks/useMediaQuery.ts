"use client";

import { useState, useEffect } from 'react';

/**
 * Custom hook to check if media query matches.
 */
export function useMediaQuery(query: string): boolean {
    const [matches, setMatches] = useState(false);

    useEffect(() => {
        const media = window.matchMedia(query);
        if (media.matches !== matches) {
            setMatches(media.matches);
        }
        
        const listener = () => setMatches(media.matches);
        media.addEventListener('change', listener);
        
        return () => media.removeEventListener('change', listener);
    }, [matches, query]);

    return matches;
}

/**
 * Standard hook for mobile breakpoint.
 */
export function useIsMobile() {
    return useMediaQuery('(max-width: 768px)');
}
