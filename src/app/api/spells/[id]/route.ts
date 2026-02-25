/**
 * @fileoverview API routes for single spell operations (get, update, delete).
 *
 * @see specs/004-spells-catalog/spec.md - FR-004, FR-007, FR-008
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth, currentUser } from '@clerk/nextjs/server';
import { getSpellById, updateSpell, deleteSpell } from '@/features/spells/api/spells-service';
import { updateSpellSchema } from '@/features/spells/api/validation';

/**
 * GET /api/spells/[id]
 * Get a single spell by ID
 *
 * @example
 * GET /api/spells/507f1f77bcf86cd799439011
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    // Check if user is admin to allow viewing inactive spells
    const { userId } = await auth();
    const user = userId ? await currentUser() : null;
    const isAdmin = user?.publicMetadata?.role === 'admin';

    // Call service layer
    const spell = await getSpellById(id, isAdmin);

    if (!spell) {
      return NextResponse.json({ error: 'Magia não encontrada' }, { status: 404 });
    }

    return NextResponse.json(spell);
  } catch (error) {
    console.error('[API] GET /api/spells/[id] error:', error);

    // Handle CastError for invalid ObjectId format
    if (error instanceof Error && error.name === 'CastError') {
      return NextResponse.json({ error: 'Formato de ID inválido' }, { status: 400 });
    }

    // Handle inactive spell access error
    if (error instanceof Error && error.message.includes('não encontrada')) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    return NextResponse.json({ error: 'Erro ao buscar magia' }, { status: 500 });
  }
}

/**
 * PUT /api/spells/[id]
 * Update a spell (admin only)
 *
 * @example
 * PUT /api/spells/507f1f77bcf86cd799439011
 * {
 *   "description": "Descrição atualizada",
 *   "status": "inactive"
 * }
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Auth check
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const user = await currentUser();

    if (!user) {
      return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
    }

    // Admin check
    const isAdmin = user.publicMetadata?.role === 'admin';

    if (!isAdmin) {
      return NextResponse.json({ error: 'Acesso negado. Apenas administradores podem editar magias.' }, { status: 403 });
    }

    const { id } = await params;

    // Parse and validate request body
    let body;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Corpo da requisição inválido (JSON malformado)' }, { status: 400 });
    }

    const validation = updateSpellSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Dados de validação falharam', details: validation.error.flatten() },
        { status: 400 }
      );
    }

    // Call service layer
    const updatedSpell = await updateSpell(id, validation.data, userId);

    if (!updatedSpell) {
      return NextResponse.json({ error: 'Magia não encontrada' }, { status: 404 });
    }

    return NextResponse.json(updatedSpell);
  } catch (error) {
    console.error('[API] PATCH /api/spells/[id] error:', error);

    // Handle CastError for invalid ObjectId format
    if (error instanceof Error && error.name === 'CastError') {
      return NextResponse.json({ error: 'Formato de ID inválido' }, { status: 400 });
    }

    // Check for duplicate name error
    if (error instanceof Error && error.message.includes('já existe')) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ error: 'Erro ao atualizar magia' }, { status: 500 });
  }
}

/**
 * PATCH /api/spells/[id]
 * Update a spell (admin only)
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return PUT(req, { params });
}

/**
 * DELETE /api/spells/[id]
 * Delete a spell (admin only)
 *
 * @example
 * DELETE /api/spells/507f1f77bcf86cd799439011
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Auth check
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const user = await currentUser();

    if (!user) {
      return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
    }

    // Admin check
    const isAdmin = user.publicMetadata?.role === 'admin';

    if (!isAdmin) {
      return NextResponse.json({ error: 'Acesso negado. Apenas administradores podem excluir magias.' }, { status: 403 });
    }

    const { id } = await params;

    // Call service layer
    const deletedSpell = await deleteSpell(id, userId);

    if (!deletedSpell) {
      return NextResponse.json({ error: 'Magia não encontrada' }, { status: 404 });
    }

    return NextResponse.json({ message: 'Magia excluída com sucesso', spell: deletedSpell });
  } catch (error) {
    console.error('[API] DELETE /api/spells/[id] error:', error);

    // Handle CastError for invalid ObjectId format
    if (error instanceof Error && error.name === 'CastError') {
      return NextResponse.json({ error: 'Formato de ID inválido' }, { status: 400 });
    }

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ error: 'Erro ao excluir magia' }, { status: 500 });
  }
}
