import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { Feat } from '@/features/feats/models/feat';
import { createAuditLog } from '@/features/users/api/audit-service';
import dbConnect from '@/core/database/db';
import { applyFuzzySearch } from "@/core/utils/search-engine"
import { createFeatSchema } from '@/features/feats/api/validation';

/**
 * GET /api/feats
 * List feats with filters and pagination
 */
export async function GET(req: NextRequest) {
  try {
    await dbConnect();
    const url = new URL(req.url);
    const page = parseInt(url.searchParams.get('page') || '1', 10);
    const limit = parseInt(url.searchParams.get('limit') || '10', 10);
    const search = url.searchParams.get('search') || '';
    const searchField = url.searchParams.get('searchField') || 'all';
    const status = url.searchParams.get('status');
    const level = url.searchParams.get('level');
    const levelMax = url.searchParams.get('levelMax');
    const attributes = url.searchParams.get("attributes")?.split(",").filter(Boolean)

    const query: Record<string, unknown> = {}

    // Status filter
    if (status && status !== "all") {
        if (status === "active" || status === "inactive") {
            query.status = status
        }
    }

    // Level filter (exact match)
    if (level) {
        const levelNum = parseInt(level, 10)
        if (!isNaN(levelNum) && levelNum >= 1 && levelNum <= 20) {
            query.level = levelNum
        }
    }

    // Level range filter (1 to levelMax)
    if (levelMax && !level) {
        const levelMaxNum = parseInt(levelMax, 10)
        if (!isNaN(levelMaxNum) && levelMaxNum >= 1 && levelMaxNum <= 20) {
            query.level = { $lte: levelMaxNum }
        }
    }

    // Attributes filter (multi-select)
    if (attributes && attributes.length > 0) {
        query["attributeBonuses.attribute"] = { $in: attributes }
    }

    // ALWAYS fetch items matching non-search filters
    // We fetch EVERYTHING without DB-level limit/search to let applyFuzzySearch do its job properly
    const items = await Feat.find(query as any).sort({ name: 1 })

    // Apply fuzzy search locally using the shared function
    const searchedItems = search ? applyFuzzySearch(items, search) : items

    const total = searchedItems.length

    // Manual pagination if limit is provided (for table/page views)
    let paginatedItems = searchedItems
    if (limit) {
        const offset = (page - 1) * limit
        paginatedItems = searchedItems.slice(offset, offset + limit)
    }

    const totalPages = limit ? Math.ceil(total / limit) : 1

    return NextResponse.json({
      items: paginatedItems,
      total,
      page,
      limit: limit || total,
      totalPages,
    });
  } catch (error) {
    console.error('Feats GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch feats' }, { status: 500 });
  }
}

/**
 * POST /api/feats
 * Create new feat
 */
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session || !session.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const parseResult = createFeatSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json({ error: (parseResult.error as any).errors }, { status: 400 });
    }

    const validatedData = parseResult.data;

    await dbConnect();

    // Check uniqueness (case-insensitive)
    const existing = await Feat.findOne({ name: new RegExp(`^${validatedData.name}$`, 'i') });
    if (existing) {
      return NextResponse.json({ error: 'Feat name already exists' }, { status: 409 });
    }

    const newFeat = await Feat.create(validatedData);

    // Audit Log
    try {
      await createAuditLog({
        action: 'CREATE',
        entity: 'Feat' as any,
        entityId: String(newFeat._id),
        performedBy: session.userId,
        newData: newFeat.toObject() as unknown as Record<string, unknown>,
      });
    } catch (auditError) {
      console.warn('Failed to create audit log for feat creation', auditError);
    }

    return NextResponse.json(newFeat, { status: 201 });
  } catch (error) {
    console.error('Feats POST error:', error);
    return NextResponse.json({ error: 'Failed to create feat' }, { status: 500 });
  }
}
