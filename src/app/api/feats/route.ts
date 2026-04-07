import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createFeatSchema } from '@/features/feats/api/validation';
import { listFeats, createFeat } from '@/features/feats/api/feats-service';
import type { FeatsFilters } from '@/features/feats/types/feats.types';
import type { FeatCategory } from '@/features/feats/lib/feat-categories';

/**
 * GET /api/feats
 * List feats with filters and pagination
 */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const page = parseInt(url.searchParams.get('page') || '1', 10);
    const limit = parseInt(url.searchParams.get('limit') || '10', 10);
    const search = url.searchParams.get('search') || '';
    const searchField = (url.searchParams.get('searchField') || 'all') as FeatsFilters['searchField'];
    const status = url.searchParams.get('status') as FeatsFilters['status'] | null;
    const level = url.searchParams.get('level');
    const levelMax = url.searchParams.get('levelMax');
    const attributes = url.searchParams.get('attributes')?.split(',').filter(Boolean);
    const categories = url.searchParams
      .get('categories')
      ?.split(',')
      .filter(Boolean) as FeatCategory[] | undefined;

    const { userId } = await auth();
    const isAdmin = !!userId;

    const filters: FeatsFilters = {
      search: search || undefined,
      searchField,
      status: status ?? undefined,
      level: level ? parseInt(level, 10) : undefined,
      levelMax: levelMax ? parseInt(levelMax, 10) : undefined,
      attributes,
      categories,
    };

    const result = await listFeats(filters, page, limit, isAdmin);

    return NextResponse.json(result);
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
      return NextResponse.json({ error: parseResult.error.issues }, { status: 400 });
    }

    const newFeat = await createFeat(parseResult.data, session.userId);

    return NextResponse.json(newFeat, { status: 201 });
  } catch (error) {
    console.error('Feats POST error:', error);
    if (error instanceof Error && error.message.includes('já existe')) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return NextResponse.json({ error: 'Failed to create feat' }, { status: 500 });
  }
}

