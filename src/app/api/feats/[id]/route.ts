import { NextRequest, NextResponse } from 'next/server';
import { auth, currentUser } from '@clerk/nextjs/server';
import { Feat } from '@/features/feats/models/feat';
import { createAuditLog } from '@/features/users/api/audit-service';
import dbConnect from '@/core/database/db';
import { updateFeatSchema } from '@/features/feats/api/validation';

/**
 * GET /api/feats/[id]
 * Get feat by ID
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await dbConnect();

    const feat = await Feat.findById(id);
    if (!feat) {
      return NextResponse.json({ error: 'Feat not found' }, { status: 404 });
    }

    return NextResponse.json(feat);
  } catch (error) {
    console.error('Feat GET error:', error);
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

    const user = await currentUser();
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const { id } = await params;
    await dbConnect();

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
        { status: 400 }
      );
    }

    const existingFeat = await Feat.findById(id);
    if (!existingFeat) {
      return NextResponse.json({ error: 'Feat not found' }, { status: 404 });
    }

    // Capture previous state for audit
    const previousData = {
      name: existingFeat.name,
      description: existingFeat.description,
      source: existingFeat.source,
      level: existingFeat.level,
      prerequisites: existingFeat.prerequisites,
      status: existingFeat.status,
    };

    // Apply updates
    if (validation.data.name) existingFeat.name = validation.data.name;
    if (validation.data.description) existingFeat.description = validation.data.description;
    if (validation.data.source) existingFeat.source = validation.data.source;
    if (validation.data.level !== undefined) existingFeat.level = validation.data.level;
    if (validation.data.prerequisites !== undefined)
      existingFeat.prerequisites = validation.data.prerequisites;
    if (validation.data.status) existingFeat.status = validation.data.status;

    const updatedFeat = await existingFeat.save();

    // Create Audit Log
    try {
      await createAuditLog({
        action: 'UPDATE',
        entity: 'Feat' as any,
        entityId: updatedFeat._id.toString(),
        performedBy: userId,
        previousData,
        newData: {
          name: updatedFeat.name,
          description: updatedFeat.description,
          source: updatedFeat.source,
          level: updatedFeat.level,
          prerequisites: updatedFeat.prerequisites,
          status: updatedFeat.status,
        },
        metadata: {
          reason: 'API Update',
          userAgent: req.headers.get('user-agent') || 'Unknown',
          ip: req.headers.get('x-forwarded-for') || 'Unknown',
        },
      });
    } catch (auditError) {
      console.error('Failed to create audit log for update:', auditError);
    }

    return NextResponse.json(updatedFeat);
  } catch (error) {
    console.error('Feat PUT error:', error);
    if ((error as { name?: string }).name === 'CastError') {
      return NextResponse.json({ error: 'Invalid ID format' }, { status: 400 });
    }
    if ((error as { code?: number }).code === 11000) {
      return NextResponse.json({ error: 'Feat name already exists' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Failed to update feat' }, { status: 500 });
  }
}

/**
 * DELETE /api/feats/[id]
 * Delete feat
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await currentUser();
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const { id } = await params;
    await dbConnect();

    const existingFeat = await Feat.findById(id);
    if (!existingFeat) {
      return NextResponse.json({ error: 'Feat not found' }, { status: 404 });
    }

    // Capture state before deletion for audit
    const previousData = {
      name: existingFeat.name,
      description: existingFeat.description,
      source: existingFeat.source,
      level: existingFeat.level,
      prerequisites: existingFeat.prerequisites,
      status: existingFeat.status,
    };

    await Feat.findByIdAndDelete(id);

    // Create Audit Log
    try {
      await createAuditLog({
        action: 'DELETE',
        entity: 'Feat',
        entityId: id,
        performedBy: userId,
        previousData,
        metadata: {
          reason: 'API Delete',
          userAgent: req.headers.get('user-agent') || 'Unknown',
          ip: req.headers.get('x-forwarded-for') || 'Unknown',
        },
      });
    } catch (auditError) {
      console.error('Failed to create audit log for deletion:', auditError);
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
