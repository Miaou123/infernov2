/**
 * Burns API Route
 * GET /api/burns - Get burn history with pagination
 */
import { NextResponse } from 'next/server';
import { getBurns, getTotalBurned } from '@/lib/database';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50');
    const page = parseInt(searchParams.get('page') || '1');
    const burnType = searchParams.get('type') || null;
    
    const offset = (page - 1) * limit;
    
    const burns = getBurns({ limit, offset, burnType });
    const total = getTotalBurned();
    
    // Format burns for frontend
    const formattedBurns = burns.map(burn => ({
      id: burn.id,
      burnType: burn.burn_type,
      burnAmount: burn.burn_amount,
      txSignature: burn.tx_signature,
      marketCap: burn.market_cap_at_burn,
      solPrice: burn.sol_price_at_burn,
      tokenPrice: burn.token_price_at_burn,
      milestoneTarget: burn.milestone_target,
      solSpent: burn.sol_spent,
      tokensBought: burn.tokens_bought,
      timestamp: burn.created_at
    }));
    
    return NextResponse.json({
      burns: formattedBurns,
      pagination: {
        total: burns.length,
        page,
        limit,
        pages: Math.ceil(burns.length / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching burns:', error);
    return NextResponse.json(
      { error: 'Failed to fetch burns' },
      { status: 500 }
    );
  }
}
