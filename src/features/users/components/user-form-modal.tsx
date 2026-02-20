"use client";

/**
 * @fileoverview User form modal for creating and editing users.
 *
 * @see specs/000/spec.md - FR-009, FR-010
 */

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { motion, AnimatePresence } from 'framer-motion';
import { User as UserIcon, Mail, AtSign, Shield, Loader2 } from 'lucide-react';
import { cn } from '@/core/utils';
import {
  GlassModal,
  GlassModalContent,
  GlassModalHeader,
  GlassModalTitle,
  GlassModalDescription,
} from '@/components/ui/glass-modal';
import { glassConfig } from '@/lib/config/glass-config';
import { RoleTabs } from '@/components/ui/role-tabs';
import { createUserSchema, updateUserSchema, type CreateUserSchema, type UpdateUserSchema } from '../api/validation';
import type { User, UserResponse, CreateUserInput, UpdateUserInput } from '../types/user.types';

export interface UserFormModalProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Close modal callback */
  onClose: () => void;
  /** Submit callback */
  onSubmit: (data: CreateUserInput | UpdateUserInput) => Promise<void>;
  /** User to edit (null for create mode) */
  user?: UserResponse | null;
  /** Whether form is submitting */
  isSubmitting?: boolean;
}

/**
 * User form modal for CRUD operations.
 *
 * @example
 * ```tsx
 * <UserFormModal
 *   isOpen={isOpen}
 *   onClose={handleClose}
 *   onSubmit={handleSubmit}
 *   user={selectedUser}
 * />
 * ```
 */
export function UserFormModal({
  isOpen,
  onClose,
  onSubmit,
  user,
  isSubmitting = false,
}: UserFormModalProps) {
  const isEditMode = !!user;

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<CreateUserSchema | UpdateUserSchema>({
    resolver: zodResolver(isEditMode ? updateUserSchema : createUserSchema),
    defaultValues: {
      username: user?.username || '',
      email: user?.email || '',
      name: user?.name || '',
      role: user?.role || 'user',
    },
  });

  const role = watch('role');

  // Reset form when modal opens/closes or user changes
  React.useEffect(() => {
    if (isOpen) {
      reset({
        username: user?.username || '',
        email: user?.email || '',
        name: user?.name || '',
        role: user?.role || 'user',
      });
    }
  }, [isOpen, user, reset]);

  const handleFormSubmit = async (data: CreateUserSchema | UpdateUserSchema) => {
    await onSubmit(data);
  };

  return (
    <GlassModal open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <GlassModalContent size="md">
        <GlassModalHeader>
          <GlassModalTitle>
            {isEditMode ? 'Editar Usuário' : 'Novo Usuário'}
          </GlassModalTitle>
          <GlassModalDescription>
            {isEditMode
              ? 'Atualize as informações do usuário'
              : 'Preencha os dados para criar um novo usuário'}
          </GlassModalDescription>
        </GlassModalHeader>

        <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6">
          {/* Name */}
          <div className="space-y-2">
            <label htmlFor="name" className="text-sm font-medium text-white/80">
              Nome
            </label>
            <div className="relative">
              <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
              <input
                id="name"
                type="text"
                {...register('name')}
                className={cn(
                  'w-full h-10 pl-10 pr-4 rounded-lg text-sm',
                  'text-white placeholder:text-white/40',
                  glassConfig.input.blur,
                  glassConfig.input.background,
                  glassConfig.input.border,
                  'focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50',
                  errors.name && 'border-rose-400/50 focus:ring-rose-400/30'
                )}
                placeholder="Nome completo"
              />
            </div>
            <AnimatePresence>
              {errors.name && (
                <motion.p
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="text-xs text-rose-400"
                >
                  {errors.name.message}
                </motion.p>
              )}
            </AnimatePresence>
          </div>

          {/* Username */}
          <div className="space-y-2">
            <label htmlFor="username" className="text-sm font-medium text-white/80">
              Username <span className="text-rose-400">*</span>
            </label>
            <div className="relative">
              <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
              <input
                id="username"
                type="text"
                {...register('username')}
                className={cn(
                  'w-full h-10 pl-10 pr-4 rounded-lg text-sm',
                  'text-white placeholder:text-white/40',
                  glassConfig.input.blur,
                  glassConfig.input.background,
                  glassConfig.input.border,
                  'focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50',
                  errors.username && 'border-rose-400/50 focus:ring-rose-400/30'
                )}
                placeholder="username_exemplo"
              />
            </div>
            <AnimatePresence>
              {errors.username && (
                <motion.p
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="text-xs text-rose-400"
                >
                  {errors.username.message}
                </motion.p>
              )}
            </AnimatePresence>
          </div>

          {/* Email */}
          <div className="space-y-2">
            <label htmlFor="email" className="text-sm font-medium text-white/80">
              Email <span className="text-rose-400">*</span>
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
              <input
                id="email"
                type="email"
                {...register('email')}
                className={cn(
                  'w-full h-10 pl-10 pr-4 rounded-lg text-sm',
                  'text-white placeholder:text-white/40',
                  glassConfig.input.blur,
                  glassConfig.input.background,
                  glassConfig.input.border,
                  'focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50',
                  errors.email && 'border-rose-400/50 focus:ring-rose-400/30'
                )}
                placeholder="email@exemplo.com"
              />
            </div>
            <AnimatePresence>
              {errors.email && (
                <motion.p
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="text-xs text-rose-400"
                >
                  {errors.email.message}
                </motion.p>
              )}
            </AnimatePresence>
          </div>

          {/* Role */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-white/80 flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Função <span className="text-rose-400">*</span>
            </label>
            <RoleTabs
              value={role === 'admin' || role === 'user' ? role : 'user'}
              onChange={(newRole) => {
                if (newRole !== 'all') {
                  setValue('role', newRole);
                }
              }}
              showAll={false}
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-white/10">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className={cn(
                'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                'text-white/60 hover:text-white hover:bg-white/10',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className={cn(
                'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                'bg-blue-500 text-white hover:bg-blue-600',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                'flex items-center gap-2'
              )}
            >
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {isEditMode ? 'Salvar' : 'Criar'}
            </button>
          </div>
        </form>
      </GlassModalContent>
    </GlassModal>
  );
}
