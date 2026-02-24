import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/core/database/db';
import { Feat } from '@/features/feats/models/feat';

/**
 * GET /api/feats/search - Search feats for mention system
 * Returns active feats only with simplified data for autocomplete
 */
export async function GET(req: NextRequest) {
  try {
    await dbConnect();

    const { searchParams } = new URL(req.url);
    const query = searchParams.get('query') || '';
    const limit = Math.min(parseInt(searchParams.get('limit') || '10', 10), 50);

    // Search only active feats by name (case-insensitive)
    const searchQuery = {
      status: 'active',
      ...(query ? { name: { $regex: query, $options: 'i' } } : {}),
    };

    const feats = await Feat
      .find(searchQuery)
      .select('_id name level')
      .sort({ name: 1 })
      .limit(limit)
      .lean();

    // Transform to mention system format
    const results = feats.map((feat) => ({
      id: feat._id.toString(),
      label: feat.name,
      entityType: 'Talento',
      metadata: {
        level: feat.level,
      },
    }));

    return NextResponse.json({ items: results });
  } catch (error) {
    console.error('Error searching feats for mentions:', error);
    return NextResponse.json(
      { error: 'Failed to search feats' },
      { status: 500 }
    );
  }
}
