"use client";

/**
 * @fileoverview UserChip component displaying user avatar, name, and tooltip.
 *
 * @see specs/000/spec.md - FR-018
 */

import * as React from 'react';
import { cn } from '@/core/utils';
import {
  GlassTooltip,
  GlassTooltipContent,
  GlassTooltipTrigger,
  GlassTooltipProvider,
} from './glass-tooltip';
import { Chip } from './chip';

export interface UserChipProps extends React.HTMLAttributes<HTMLDivElement> {
  /** User display name */
  name: string;
  /** User email */
  email?: string;
  /** User avatar URL */
  avatarUrl?: string;
  /** User role */
  role?: 'admin' | 'user';
  /** User status */
  status?: 'active' | 'inactive';
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Whether to show tooltip with details */
  showTooltip?: boolean;
  /** Whether to show role badge */
  showRole?: boolean;
}

/**
 * UserChip component displaying user information with optional tooltip.
 *
 * @example
 * ```tsx
 * <UserChip
 *   name="John Doe"
 *   email="john@example.com"
 *   avatarUrl="https://..."
 *   role="admin"
 *   showTooltip
 * />
 * ```
 */
export function UserChip({
  name,
  email,
  avatarUrl,
  role,
  status = 'active',
  size = 'md',
  showTooltip = true,
  showRole = false,
  className,
  ...props
}: UserChipProps) {
  const sizeClasses = {
    sm: {
      container: 'gap-1.5',
      avatar: 'h-5 w-5',
      text: 'text-xs',
    },
    md: {
      container: 'gap-2',
      avatar: 'h-6 w-6',
      text: 'text-sm',
    },
    lg: {
      container: 'gap-2.5',
      avatar: 'h-8 w-8',
      text: 'text-base',
    },
  };

  const sizes = sizeClasses[size];

  // Generate initials from name
  const initials =
      name
          ?.split(" ")
          .map((n) => n[0])
          .join("")
          .toUpperCase()
          .slice(0, 2) || ""

  const chipContent = (
    <div
      className={cn(
        'inline-flex items-center',
        sizes.container,
        className
      )}
      {...props}
    >
      {/* Avatar */}
      <div
        className={cn(
          'relative flex items-center justify-center rounded-full overflow-hidden',
          'bg-white/10 border border-white/10',
          sizes.avatar
        )}
      >
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarUrl}
            alt={name}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="text-[10px] font-medium text-white/60">
            {initials}
          </span>
        )}
        {/* Status indicator */}
        <span
          className={cn(
            'absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-black',
            status === 'active' ? 'bg-emerald-400' : 'bg-gray-400'
          )}
        />
      </div>

      {/* Name */}
      <span
        className={cn(
          'truncate max-w-[150px] text-white/80',
          sizes.text
        )}
      >
        {name}
      </span>

      {/* Role badge */}
      {showRole && role && (
        <Chip
          variant={role === 'admin' ? 'artifact' : 'veryRare'}
          size="sm"
        >
          {role === 'admin' ? 'Admin' : 'User'}
        </Chip>
      )}
    </div>
  );

  if (!showTooltip) {
    return chipContent;
  }

  return (
    <GlassTooltipProvider>
      <GlassTooltip delayDuration={300}>
        <GlassTooltipTrigger asChild>
          <div className="cursor-pointer">{chipContent}</div>
        </GlassTooltipTrigger>
        <GlassTooltipContent side="top" className="p-3 max-w-xs">
          <div className="flex flex-col gap-1">
            <span className="font-medium text-white">{name}</span>
            {email && (
              <span className="text-xs text-white/60">{email}</span>
            )}
            <div className="flex items-center gap-2 mt-1">
              <Chip
                variant={role === 'admin' ? 'artifact' : 'veryRare'}
                size="sm"
              >
                {role === 'admin' ? 'Admin' : 'User'}
              </Chip>
              <Chip
                variant={status === 'active' ? 'uncommon' : 'common'}
                size="sm"
              >
                {status === 'active' ? 'Ativo' : 'Inativo'}
              </Chip>
            </div>
          </div>
        </GlassTooltipContent>
      </GlassTooltip>
    </GlassTooltipProvider>
  );
}
