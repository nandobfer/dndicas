"use client";

/**
 * @fileoverview ConfirmDialog component for confirmation modals.
 * Features Liquid Glass styling with customizable actions.
 *
 * @example
 * ```tsx
 * <ConfirmDialog
 *   open={open}
 *   onOpenChange={setOpen}
 *   title="Confirmar exclusão"
 *   description="Tem certeza que deseja excluir este usuário?"
 *   onConfirm={handleDelete}
 *   variant="danger"
 * />
 * ```
 */

import * as React from 'react';
import { AlertTriangle, Info, CheckCircle, XCircle } from 'lucide-react';
import { type LucideIcon } from 'lucide-react';
import { cn } from '@/core/utils';
import { colors } from '@/lib/config/colors';
import { Button } from '@/core/ui/button';
import {
  GlassModal,
  GlassModalContent,
  GlassModalHeader,
  GlassModalTitle,
  GlassModalDescription,
  GlassModalFooter,
} from './glass-modal';

export type ConfirmDialogVariant = 'default' | 'danger' | 'warning' | 'success';

export interface ConfirmDialogProps {
  /** Whether the dialog is open */
  open: boolean;
  /** Callback when open state changes */
  onOpenChange: (open: boolean) => void;
  /** Dialog title */
  title: string;
  /** Dialog description */
  description?: string;
  /** Confirm button text */
  confirmText?: string;
  /** Cancel button text */
  cancelText?: string;
  /** Confirm callback */
  onConfirm: () => void | Promise<void>;
  /** Cancel callback */
  onCancel?: () => void;
  /** Whether the confirm action is in progress */
  isLoading?: boolean;
  /** Visual variant */
  variant?: ConfirmDialogVariant;
  /** Custom icon */
  icon?: LucideIcon;
  /** Additional content between description and buttons */
  children?: React.ReactNode;
}

const variantConfig: Record<
  ConfirmDialogVariant,
  { icon: LucideIcon; color: string; buttonVariant: 'default' | 'destructive' | 'outline' }
> = {
  default: {
    icon: Info,
    color: colors.rarity.rare,
    buttonVariant: 'default',
  },
  danger: {
    icon: XCircle,
    color: colors.rarity.artifact,
    buttonVariant: 'destructive',
  },
  warning: {
    icon: AlertTriangle,
    color: colors.rarity.legendary,
    buttonVariant: 'default',
  },
  success: {
    icon: CheckCircle,
    color: colors.rarity.uncommon,
    buttonVariant: 'default',
  },
};

/**
 * Confirmation dialog with Liquid Glass styling.
 * Provides a consistent way to confirm user actions.
 */
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  onOpenChange,
  title,
  description,
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  onConfirm,
  onCancel,
  isLoading = false,
  variant = 'default',
  icon: CustomIcon,
  children,
}) => {
  const config = variantConfig[variant];
  const Icon = CustomIcon || config.icon;

  const handleConfirm = async () => {
    await onConfirm();
    if (!isLoading) {
      onOpenChange(false);
    }
  };

  const handleCancel = () => {
    onCancel?.();
    onOpenChange(false);
  };

  return (
    <GlassModal open={open} onOpenChange={onOpenChange}>
      <GlassModalContent size="sm" hideCloseButton>
        <GlassModalHeader>
          <div className="flex items-start gap-4">
            <div
              className={cn(
                'flex items-center justify-center rounded-full p-2',
                'bg-white/5'
              )}
              style={{ borderColor: `${config.color}30` }}
            >
              <Icon
                className="h-6 w-6"
                style={{ color: config.color }}
                aria-hidden="true"
              />
            </div>
            <div className="flex-1 text-left">
              <GlassModalTitle>{title}</GlassModalTitle>
              {description && (
                <GlassModalDescription className="mt-1">
                  {description}
                </GlassModalDescription>
              )}
            </div>
          </div>
        </GlassModalHeader>

        {children && <div className="py-2">{children}</div>}

        <GlassModalFooter>
          <Button
            variant="outline"
            onClick={handleCancel}
            disabled={isLoading}
            className="flex-1 sm:flex-none"
          >
            {cancelText}
          </Button>
          <Button
            variant={config.buttonVariant}
            onClick={handleConfirm}
            disabled={isLoading}
            className="flex-1 sm:flex-none"
          >
            {isLoading ? 'Processando...' : confirmText}
          </Button>
        </GlassModalFooter>
      </GlassModalContent>
    </GlassModal>
  );
};

ConfirmDialog.displayName = 'ConfirmDialog';
