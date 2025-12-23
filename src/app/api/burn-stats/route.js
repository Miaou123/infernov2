/**
 * Burn Stats API Route
 * GET /api/burn-stats - Get comprehensive burn statistics
 */
import { NextResponse } from 'next/server';
import { getBurnStats, getMilestoneStats } from '@/lib/database';

export async function GET() {
  try {
    const stats = getBurnStats();
    const milestoneStats = getMilestoneStats();
    
    return NextResponse.json({
      success: true,
      totalBurned: stats.totalBurned,
      circulatingSupply: stats.circulatingSupply,
      initialSupply: stats.initialSupply,
      burnPercentage: stats.burnPercentage,
      burnsByType: stats.burnsByType,
      burns24h: stats.burns24h,
      recentBurns: stats.recentBurns.map(burn => ({
        id: burn.id,
        burnType: burn.burn_type,
        burnAmount: burn.burn_amount,
        txSignature: burn.tx_signature,
        timestamp: burn.created_at
      })),
      milestoneStats: {
        total: milestoneStats.total,
        completed: milestoneStats.completed,
        totalBurned: milestoneStats.total_burned
      },
      timestamp: stats.timestamp
    });
  } catch (error) {
    console.error('Error fetching burn stats:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch burn stats' },
      { status: 500 }
    );
  }
}
