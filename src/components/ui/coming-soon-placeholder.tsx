"use client";

/**
 * @fileoverview ComingSoonPlaceholder component for features not yet implemented.
 * Features Liquid Glass styling with icon and message about upcoming functionality.
 *
 * @example
 * ```tsx
 * <ComingSoonPlaceholder
 *   icon={Gamepad2}
 *   title="Integração Owlbear Rodeo"
 *   description="Em breve você poderá conectar suas sessões ao Owlbear Rodeo."
 * />
 * ```
 */

import * as React from 'react';
import { motion } from 'framer-motion';
import { type LucideIcon, Sparkles, Clock } from 'lucide-react';
import { cn } from '@/core/utils';
import { glassConfig } from '@/lib/config/glass-config';
import { motionConfig } from '@/lib/config/motion-configs';
import { colors } from '@/lib/config/colors';

export interface ComingSoonPlaceholderProps {
  /** Icon to display */
  icon?: LucideIcon;
  /** Feature title */
  title: string;
  /** Description of the upcoming feature */
  description?: string;
  /** Expected release (optional) */
  expectedRelease?: string;
  /** Additional CSS classes */
  className?: string;
  /** Whether to show in a card container */
  card?: boolean;
}

/**
 * Placeholder component for features that are planned but not yet implemented.
 * Provides clear communication that the feature is coming soon.
 */
export const ComingSoonPlaceholder: React.FC<ComingSoonPlaceholderProps> = ({
  icon: Icon = Sparkles,
  title,
  description,
  expectedRelease,
  className,
  card = true,
}) => {
  const content = (
    <motion.div
      className={cn(
        'flex flex-col items-center justify-center gap-4 text-center py-12',
        className
      )}
      variants={motionConfig.variants.fadeInUp}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={motionConfig.transitions.normal}
    >
      {/* Animated icon container */}
      <motion.div
        className={cn(
          'relative rounded-full p-6',
          glassConfig.card.blur,
          'bg-gradient-to-br from-purple-500/10 to-blue-500/10',
          'border border-purple-500/20'
        )}
        animate={{
          boxShadow: [
            `0 0 20px ${colors.glass.glow}`,
            `0 0 40px ${colors.rarity.veryRare}30`,
            `0 0 20px ${colors.glass.glow}`,
          ],
        }}
        transition={{
          duration: 3,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      >
        <Icon
          className="h-12 w-12"
          style={{ color: colors.rarity.veryRare }}
          aria-hidden="true"
        />

        {/* Sparkle decorations */}
        <motion.div
          className="absolute -top-1 -right-1"
          animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 2, repeat: Infinity, delay: 0 }}
        >
          <Sparkles className="h-4 w-4 text-yellow-400" />
        </motion.div>
        <motion.div
          className="absolute -bottom-1 -left-1"
          animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 2, repeat: Infinity, delay: 0.5 }}
        >
          <Sparkles className="h-3 w-3 text-purple-400" />
        </motion.div>
      </motion.div>

      {/* Text content */}
      <div className="space-y-2">
        <h3 className="text-xl font-semibold text-white">
          {title}
        </h3>
        {description && (
          <p className="text-white/60 max-w-md text-sm">
            {description}
          </p>
        )}
      </div>

      {/* Coming soon badge */}
      <motion.div
        className={cn(
          'flex items-center gap-2 px-4 py-2 rounded-full',
          glassConfig.card.blur,
          glassConfig.card.background,
          glassConfig.card.border
        )}
        whileHover={{ scale: 1.05 }}
        transition={motionConfig.transitions.fast}
      >
        <Clock className="h-4 w-4 text-white/60" aria-hidden="true" />
        <span className="text-sm text-white/60">
          {expectedRelease || 'Em breve'}
        </span>
      </motion.div>
    </motion.div>
  );

  if (card) {
    return (
      <div
        className={cn(
          'rounded-xl p-6',
          glassConfig.card.blur,
          glassConfig.card.background,
          glassConfig.card.border
        )}
      >
        {content}
      </div>
    );
  }

  return content;
};

ComingSoonPlaceholder.displayName = 'ComingSoonPlaceholder';
