import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { updateFeatSchema } from '@/features/feats/api/validation';
import { getFeatById, updateFeat, deleteFeat } from '@/features/feats/api/feats-service';

/**
 * GET /api/feats/[id]
 * Get feat by ID
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { userId } = await auth();
    const isAdmin = !!userId;

    const feat = await getFeatById(id, isAdmin);

    if (!feat) {
      return NextResponse.json({ error: 'Feat not found' }, { status: 404 });
    }

    return NextResponse.json(feat);
  } catch (error) {
    console.error('Feat GET error:', error);
    if (error instanceof Error && error.message.includes('não encontrado')) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if ((error as { name?: string }).name === 'CastError') {
      return NextResponse.json({ error: 'Invalid ID format' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

/**
 * PUT /api/feats/[id]
 * Update feat
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    let body;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const validation = updateFeatSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.flatten() },
        { status: 400 },
      );
    }

    const updatedFeat = await updateFeat(id, validation.data, userId);

    if (!updatedFeat) {
      return NextResponse.json({ error: 'Feat not found' }, { status: 404 });
    }

    return NextResponse.json(updatedFeat);
  } catch (error) {
    console.error('Feat PUT error:', error);
    if ((error as { name?: string }).name === 'CastError') {
      return NextResponse.json({ error: 'Invalid ID format' }, { status: 400 });
    }
    if (error instanceof Error && error.message.includes('já existe')) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return NextResponse.json({ error: 'Failed to update feat' }, { status: 500 });
  }
}

/**
 * DELETE /api/feats/[id]
 * Delete feat
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const deleted = await deleteFeat(id, userId);

    if (!deleted) {
      return NextResponse.json({ error: 'Feat not found' }, { status: 404 });
    }

    return NextResponse.json({ message: 'Feat deleted successfully' });
  } catch (error) {
    console.error('Feat DELETE error:', error);
    if ((error as { name?: string }).name === 'CastError') {
      return NextResponse.json({ error: 'Invalid ID format' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to delete feat' }, { status: 500 });
  }
}

