/**
 * @fileoverview User detail API route for get, update, and delete operations.
 *
 * @see specs/000/contracts/users.yaml
 * @see specs/000/spec.md - FR-026 (prevent self-delete)
 */

import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/core/database/db';
import { User } from '@/features/users/models/user';
import { requireAdmin, getCurrentUserFromDb } from '@/features/users/api/get-current-user';
import { updateUserSchema } from '@/features/users/api/validation';
import { logUpdate, logDelete } from '@/features/users/api/audit-service';
import type { UserResponse } from '@/features/users/types/user.types';

interface RouteParams {
  params: Promise<{
    id: string;
  }>;
}

/**
 * GET /api/users/[id]
 * Get a single user by ID.
 */
export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { id } = await params;

    // Verify authentication
    const { user: currentUser } = await getCurrentUserFromDb();
    if (!currentUser) {
      return NextResponse.json(
        { error: 'Não autenticado' },
        { status: 401 }
      );
    }

    await dbConnect();

    const user = await User.findById(id).lean();
    if (!user) {
      return NextResponse.json(
        { error: 'Usuário não encontrado' },
        { status: 404 }
      );
    }

    const response: UserResponse = {
      id: user._id.toString(),
      username: user.username,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      role: user.role,
      status: user.status,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('[Users API] GET [id] error:', error);
    return NextResponse.json(
      { error: 'Erro ao buscar usuário' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/users/[id]
 * Update a user (admin only).
 */
export async function PUT(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { id } = await params;

    // Require admin
    try {
      await requireAdmin();
    } catch {
      return NextResponse.json(
        { error: 'Acesso negado. Apenas administradores podem editar usuários.' },
        { status: 403 }
      );
    }

    await dbConnect();

    // Find user
    const user = await User.findById(id);
    if (!user) {
      return NextResponse.json(
        { error: 'Usuário não encontrado' },
        { status: 404 }
      );
    }

    // Capture previous data for audit logging
    const previousData = {
      _id: user._id.toString(),
      username: user.username,
      email: user.email,
      name: user.name,
      role: user.role,
      status: user.status,
      updatedAt: user.updatedAt,
    };

    // Parse and validate body
    const body = await request.json();
    const parseResult = updateUserSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Dados inválidos', details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const data = parseResult.data;

    // Check for username conflict
    if (data.username && data.username !== user.username) {
      const existingUsername = await User.findByUsername(data.username);
      if (existingUsername && existingUsername._id.toString() !== id) {
        return NextResponse.json(
          { error: 'Username já está em uso' },
          { status: 409 }
        );
      }
    }

    // Check for email conflict
    if (data.email && data.email !== user.email) {
      const existingEmail = await User.findByEmail(data.email);
      if (existingEmail && existingEmail._id.toString() !== id) {
        return NextResponse.json(
          { error: 'Email já está em uso' },
          { status: 409 }
        );
      }
    }

    // Update fields
    if (data.username) user.username = data.username;
    if (data.email) user.email = data.email;
    if (data.name !== undefined) user.name = data.name;
    if (data.role) user.role = data.role;
    if (data.status) user.status = data.status;

    await user.save();

    // Get current admin user for audit
    const { user: adminUser } = await getCurrentUserFromDb();

    // Log audit entry for UPDATE operation
    const newData = {
      _id: user._id.toString(),
      username: user.username,
      email: user.email,
      name: user.name,
      role: user.role,
      status: user.status,
      updatedAt: user.updatedAt,
    };

    await logUpdate(
      'User',
      user._id.toString(),
      adminUser?._id.toString() || 'unknown',
      previousData,
      newData
    );

    const response: UserResponse = {
      id: user._id.toString(),
      username: user.username,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      role: user.role,
      status: user.status,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('[Users API] PUT error:', error);
    return NextResponse.json(
      { error: 'Erro ao atualizar usuário' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/users/[id]
 * Delete (soft delete) a user (admin only).
 * FR-026: Prevent self-delete.
 */
export async function DELETE(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { id } = await params;

    // Require admin and get current user
    let currentUser;
    try {
      currentUser = await requireAdmin();
    } catch {
      return NextResponse.json(
        { error: 'Acesso negado. Apenas administradores podem excluir usuários.' },
        { status: 403 }
      );
    }

    // FR-026: Prevent self-delete
    if (currentUser._id.toString() === id) {
      return NextResponse.json(
        { error: 'Você não pode excluir sua própria conta.' },
        { status: 400 }
      );
    }

    await dbConnect();

    // Find user
    const user = await User.findById(id);
    if (!user) {
      return NextResponse.json(
        { error: 'Usuário não encontrado' },
        { status: 404 }
      );
    }

    // Capture data before soft delete for audit
    const previousData = {
      _id: user._id.toString(),
      email: user.email,
      name: user.name,
      role: user.role,
      status: user.status,
    };

    // Soft delete - set status to inactive
    user.status = 'inactive';
    await user.save();

    // Log DELETE action (soft delete)
    await logDelete(
      'User',
      user._id.toString(),
      currentUser._id.toString(),
      previousData
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Users API] DELETE error:', error);
    return NextResponse.json(
      { error: 'Erro ao excluir usuário' },
      { status: 500 }
    );
  }
}
