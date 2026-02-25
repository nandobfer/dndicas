/**
 * @fileoverview API routes for spells list and creation.
 *
 * @see specs/004-spells-catalog/spec.md - FR-004, FR-005, FR-006
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth, currentUser } from '@clerk/nextjs/server';
import { listSpells, createSpell } from '@/features/spells/api/spells-service';
import { spellsQuerySchema, createSpellSchema } from '@/features/spells/api/validation';
import type { DiceType, SpellSchool, AttributeType, SpellsFilters } from '@/features/spells/types/spells.types';

/**
 * GET /api/spells
 * List spells with filters and pagination
 *
 * @example
 * GET /api/spells?search=fogo&circles=3,5&schools=Evocação&page=1&limit=10
 */
export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth();
    const user = userId ? await currentUser() : null;
    const isAdmin = user?.publicMetadata?.role === 'admin';

    const url = new URL(req.url);
    
    // Parse query parameters
    const queryParams = {
      search: url.searchParams.get('search') || undefined,
      circles: url.searchParams.get('circles')?.split(',').map(Number).filter(n => !isNaN(n)) || undefined,
      schools: url.searchParams.get('schools')?.split(',').filter(Boolean) as SpellSchool[] | undefined,
      saveAttributes: url.searchParams.get('saveAttributes')?.split(',').filter(Boolean) as AttributeType[] | undefined,
      diceTypes: url.searchParams.get('diceTypes')?.split(',').filter(Boolean) as DiceType[] | undefined,
      status: (url.searchParams.get('status') || undefined) as 'active' | 'inactive' | 'all' | undefined,
      page: parseInt(url.searchParams.get('page') || '1', 10),
      limit: parseInt(url.searchParams.get('limit') || '10', 10),
    };

    // Validate with Zod
    const validation = spellsQuerySchema.safeParse(queryParams);
    
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Parâmetros de consulta inválidos', details: validation.error.flatten() },
        { status: 400 }
      );
    }

    const { page, limit, ...filters } = validation.data;

    // Call service layer (explicitly cast filters to SpellsFilters)
    const result = await listSpells(filters as SpellsFilters, page, limit, isAdmin);

    return NextResponse.json(result);
  } catch (error) {
    console.error('[API] GET /api/spells error:', error);
    
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    return NextResponse.json({ error: 'Erro ao listar magias' }, { status: 500 });
  }
}

/**
 * POST /api/spells
 * Create a new spell (admin only)
 *
 * @example
 * POST /api/spells
 * {
 *   "name": "Bola de Fogo",
 *   "description": "Uma explosão de fogo...",
 *   "circle": 3,
 *   "school": "Evocação",
 *   "baseDice": { "quantidade": 8, "tipo": "d6" },
 *   "status": "active"
 * }
 */
export async function POST(req: NextRequest) {
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
      return NextResponse.json({ error: 'Acesso negado. Apenas administradores podem criar magias.' }, { status: 403 });
    }

    // Parse and validate request body
    let body;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Corpo da requisição inválido (JSON malformado)' }, { status: 400 });
    }

    const validation = createSpellSchema.safeParse(body);
    
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Dados de validação falharam', details: validation.error.flatten() },
        { status: 400 }
      );
    }

    // Call service layer
    const spell = await createSpell(validation.data, userId);

    return NextResponse.json(spell, { status: 201 });
  } catch (error) {
    console.error('[API] POST /api/spells error:', error);
    
    if (error instanceof Error) {
      // Check for duplicate name error
      if (error.message.includes('já existe')) {
        return NextResponse.json({ error: error.message }, { status: 409 });
      }
      
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    return NextResponse.json({ error: 'Erro ao criar magia' }, { status: 500 });
  }
}
