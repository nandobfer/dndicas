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
import { GlassInput } from "@/components/ui/glass-input"
import { glassConfig } from "@/lib/config/glass-config"
import { RoleTabs } from "@/components/ui/role-tabs"
import { createUserSchema, updateUserSchema, type CreateUserSchema, type UpdateUserSchema } from "../api/validation"
import type { User, UserResponse, CreateUserInput, UpdateUserInput } from "../types/user.types"

export interface UserFormModalProps {
    /** Whether the modal is open */
    isOpen: boolean
    /** Close modal callback */
    onClose: () => void
    /** Submit callback */
    onSubmit: (data: CreateUserInput | UpdateUserInput) => Promise<void>
    /** User to edit (null for create mode) */
    user?: UserResponse | null
    /** Whether form is submitting */
    isSubmitting?: boolean
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
export function UserFormModal({ isOpen, onClose, onSubmit, user, isSubmitting = false }: UserFormModalProps) {
    const isEditMode = !!user

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
            username: user?.username || "",
            email: user?.email || "",
            name: user?.name || "",
            role: user?.role || "user",
        },
    })

    const role = watch("role")

    // Reset form when modal opens/closes or user changes
    React.useEffect(() => {
        if (isOpen) {
            reset({
                username: user?.username || "",
                email: user?.email || "",
                name: user?.name || "",
                role: user?.role || "user",
            })
        }
    }, [isOpen, user, reset])

    const handleFormSubmit = async (data: CreateUserSchema | UpdateUserSchema) => {
        await onSubmit(data)
    }

    return (
        <GlassModal open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <GlassModalContent size="md">
                <GlassModalHeader>
                    <GlassModalTitle>{isEditMode ? "Editar Usuário" : "Novo Usuário"}</GlassModalTitle>
                    <GlassModalDescription>{isEditMode ? "Atualize as informações do usuário" : "Preencha os dados para criar um novo usuário"}</GlassModalDescription>
                </GlassModalHeader>

                <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6">
                    {/* Name */}
                    <GlassInput id="name" label="Nome" placeholder="Nome completo" icon={<UserIcon />} error={errors.name?.message} {...register("name")} />

                    {/* Username */}
                    <GlassInput id="username" label="Username" placeholder="username_exemplo" required icon={<AtSign />} error={errors.username?.message} {...register("username")} />

                    {/* Email */}
                    <GlassInput id="email" label="Email" placeholder="email@exemplo.com" type="email" required icon={<Mail />} error={errors.email?.message} {...register("email")} />

                    {/* Role */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-white/80 flex items-center gap-2">
                            <Shield className="h-4 w-4" />
                            Função <span className="text-rose-400">*</span>
                        </label>
                        <RoleTabs
                            value={role === "admin" || role === "user" ? role : "user"}
                            onChange={(newRole) => {
                                if (newRole !== "all") {
                                    setValue("role", newRole)
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
                                "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                                "text-white/60 hover:text-white hover:bg-white/10",
                                "disabled:opacity-50 disabled:cursor-not-allowed",
                            )}
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className={cn(
                                "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                                "bg-blue-500 text-white hover:bg-blue-600",
                                "disabled:opacity-50 disabled:cursor-not-allowed",
                                "flex items-center gap-2",
                            )}
                        >
                            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                            {isEditMode ? "Salvar" : "Criar"}
                        </button>
                    </div>
                </form>
            </GlassModalContent>
        </GlassModal>
    )
}
