/**
 * @fileoverview Glass-style image component with paper texture and hover effects.
 * Used across various entity previews (Classes, Spells, Races, Items, Backgrounds).
 */

"use client";

import { cn } from "@/core/utils";

interface GlassImageProps {
    /** Image source URL */
    src: string;
    /** Image alt text */
    alt: string;
    /** Container class name */
    className?: string;
    /** Image class name */
    imageClassName?: string;
    /** Optional overlay gradient */
    showOverlay?: boolean;
}

/**
 * GlassImage Component
 * 
 * Standardized image container for entity previews with a paper texture background,
 * hover zoom effect, and optional gradient overlay.
 */
export function GlassImage({ 
    src, 
    alt, 
    className, 
    imageClassName,
    showOverlay = true 
}: GlassImageProps) {
    if (!src) return null;

    return (
        <div className={cn(
            "aspect-square rounded-xl bg-white/5 overflow-hidden shadow-2xl group/image relative bg-[image:var(--background-image-paper-texture)] bg-cover bg-center",
            className
        )}>
            <img 
                src={src} 
                alt={alt} 
                className={cn(
                    "w-full h-full object-contain transition-transform duration-500 group-hover/image:scale-110 mix-blend-multiply",
                    imageClassName
                )} 
            />
            {showOverlay && (
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover/image:opacity-100 transition-opacity duration-300" />
            )}
        </div>
    );
}
