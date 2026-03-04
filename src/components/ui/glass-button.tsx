"use client"
import * as React from "react"
import { cn } from "@/core/utils"

export interface GlassButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'outline' | 'danger'
  size?: 'sm' | 'md' | 'lg' | 'icon'
}

export const GlassButton = React.forwardRef<HTMLButtonElement, GlassButtonProps>(
  ({ className, variant = 'primary', size = 'md', ...props }, ref) => {
    const variants = {
      primary: 'bg-white/10 hover:bg-white/20 text-white border-white/10',
      secondary: 'bg-white/5 hover:bg-white/10 text-white/70 border-white/5',
      ghost: 'bg-transparent hover:bg-white/5 text-white/50 hover:text-white',
      outline: 'bg-transparent border border-white/20 hover:bg-white/5 text-white',
      danger: 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border-rose-500/20',
    }
    const sizes = {
      sm: 'px-3 py-1.5 text-xs',
      md: 'px-4 py-2 text-sm',
      lg: 'px-6 py-3 text-base',
      icon: 'p-2',
    }
    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center rounded-lg font-medium transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none border',
          variants[variant],
          sizes[size],
          className
        )}
        {...props}
      />
    )
  }
)
GlassButton.displayName = "GlassButton"
