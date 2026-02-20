"use client";

/**
 * @fileoverview UserMini component for displaying user avatar, name, and username.
 * Used for minimal user representation in tables and lists.
 */

import * as React from 'react';
import Image from "next/image";
import { cn } from "@/core/utils";
import { Chip } from './chip';

export interface UserMiniProps extends React.HTMLAttributes<HTMLDivElement> {
    /** User display name */
    name?: string;
    /** User username */
    username: string;
    /** User email */
    email?: string;
    /** User avatar URL */
    avatarUrl?: string;
    /** Size variant */
    size?: 'sm' | 'md';
}

/**
 * UserMini component with Liquid Glass styling.
 * Renders avatar, name, a small divider, and @username.
 */
export function UserMini({
    name,
    username,
    email,
    avatarUrl,
    size = 'md',
    className,
    ...props
}: UserMiniProps) {
    const initials = (name || username || "")
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2);

    return (
        <div className={cn("flex items-center gap-2", className)} {...props}>
            {/* Avatar */}
            <div 
                className={cn(
                    "flex-shrink-0 rounded-full bg-white/5 border border-white/10 flex items-center justify-center font-medium text-white overflow-hidden relative",
                    size === 'md' ? "h-10 w-10 text-sm" : "h-8 w-8 text-xs"
                )}
            >
                {avatarUrl ? (
                    <Image
                        src={avatarUrl}
                        alt={name || username}
                        fill
                        className="object-cover"
                        referrerPolicy="no-referrer"
                        unoptimized
                    />
                ) : (
                    initials
                )}
            </div>

            {/* Name and Username with Divider */}
            <div className="flex flex-col min-w-0">
                <span className={cn(
                    "font-semibold text-white truncate max-w-[240px]",
                    size === 'md' ? "text-sm" : "text-xs"
                )}>
                    {name || username}
                </span>
                <div className="h-px w-full bg-white/10 my-1 mt-1.5" />
                <span className={cn(
                    "text-white/40 lowercase font-mono",
                    size === 'md' ? "text-[11px]" : "text-[10px]"
                )}>
                    @{username}
                </span>
            </div>
        </div>
    );
}

UserMini.displayName = 'UserMini';
