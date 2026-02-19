/**
 * @fileoverview Users API route for listing and creating users.
 *
 * @see specs/000/contracts/users.yaml
 */

import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/core/database/db';
import { User } from '@/features/users/models/user';
import { requireAdmin, getCurrentUserFromDb } from '@/features/users/api/get-current-user';
import { createUserSchema, userFiltersSchema } from '@/features/users/api/validation';
import { logCreate } from '@/features/users/api/audit-service';
import type { UserFilters, UsersListResponse, UserResponse } from '@/features/users/types/user.types';

/**
 * GET /api/users
 * List users with pagination and filters.
 */
export async function GET(request: NextRequest) {
  try {
    // Verify authentication
    const { user: currentUser } = await getCurrentUserFromDb();
    if (!currentUser) {
      return NextResponse.json(
        { error: 'Não autenticado' },
        { status: 401 }
      );
    }

    await dbConnect();

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const rawFilters = {
      search: searchParams.get('search') || '',
      role: searchParams.get('role') || 'all',
      status: searchParams.get('status') || 'active',
      page: searchParams.get('page') || '1',
      limit: searchParams.get('limit') || '10',
    };

    // Validate filters
    const parseResult = userFiltersSchema.safeParse({
      ...rawFilters,
      page: parseInt(rawFilters.page, 10),
      limit: parseInt(rawFilters.limit, 10),
    });

    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Filtros inválidos', details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const filters: UserFilters = parseResult.data;

    // Build query
    interface QueryType {
      status?: string | { $in: string[] };
      role?: string;
      $or?: Array<{ [key: string]: { $regex: string; $options: string } }>;
    }
    const query: QueryType = {};

    // Status filter
    if (filters.status && filters.status !== 'all') {
      query.status = filters.status;
    } else if (!filters.status || filters.status === 'all') {
      query.status = { $in: ['active', 'inactive'] };
    }

    // Role filter
    if (filters.role && filters.role !== 'all') {
      query.role = filters.role;
    }

    // Search filter
    if (filters.search) {
      query.$or = [
        { username: { $regex: filters.search, $options: 'i' } },
        { email: { $regex: filters.search, $options: 'i' } },
        { name: { $regex: filters.search, $options: 'i' } },
      ];
    }

    // Pagination
    const page = filters.page || 1;
    const limit = filters.limit || 10;
    const skip = (page - 1) * limit;

    // Execute query
    const [users, total] = await Promise.all([
      User.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(query),
    ]);

    const response: UsersListResponse = {
      items: users.map((user) => ({
        id: user._id.toString(),
        username: user.username,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        role: user.role,
        status: user.status,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
      })),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('[Users API] GET error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Erro ao listar usuários', details: message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/users
 * Create a new user (admin only).
 */
export async function POST(request: NextRequest) {
  try {
    // Require admin
    try {
      await requireAdmin();
    } catch {
      return NextResponse.json(
        { error: 'Acesso negado. Apenas administradores podem criar usuários.' },
        { status: 403 }
      );
    }

    await dbConnect();

    // Parse and validate body
    const body = await request.json();
    const parseResult = createUserSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Dados inválidos', details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const data = parseResult.data;

    // Check for existing username
    const existingUsername = await User.findByUsername(data.username);
    if (existingUsername) {
      return NextResponse.json(
        { error: 'Username já está em uso' },
        { status: 409 }
      );
    }

    // Check for existing email
    const existingEmail = await User.findByEmail(data.email);
    if (existingEmail) {
      return NextResponse.json(
        { error: 'Email já está em uso' },
        { status: 409 }
      );
    }

    // Create user with a placeholder clerkId (should be synced via webhook)
    const user = await User.create({
      clerkId: `manual_${Date.now()}`, // Placeholder for manually created users
      username: data.username,
      email: data.email,
      name: data.name,
      role: data.role || 'user',
      status: 'active',
    });

    // Get current user for audit logging
    const { user: currentUser } = await getCurrentUserFromDb();

    // Log audit entry for CREATE operation
    await logCreate(
      'User',
      user._id.toString(),
      currentUser?._id.toString() || 'unknown',
      {
        _id: user._id.toString(),
        username: user.username,
        email: user.email,
        name: user.name,
        role: user.role,
        status: user.status,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      }
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

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    console.error('[Users API] POST error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Erro ao criar usuário', details: message },
      { status: 500 }
    );
  }
}
