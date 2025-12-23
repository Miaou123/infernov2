/**
 * Milestones API Route
 * GET /api/milestones - Get milestone status and progress
 */
import { NextResponse } from 'next/server';
import { getMilestones, getMilestoneStats } from '@/lib/database';
import { getMarketCap } from '@/lib/priceOracle';

export async function GET() {
  try {
    const milestones = getMilestones();
    const stats = getMilestoneStats();
    
    let currentMarketCap = 0;
    try {
      currentMarketCap = await getMarketCap();
    } catch (e) {
      console.error('Error fetching market cap:', e);
    }
    
    // Enhance milestones with progress info
    const enhancedMilestones = milestones.map(m => {
      const isEligible = currentMarketCap >= m.market_cap;
      const isPending = isEligible && !m.completed;
      
      return {
        marketCap: m.market_cap,
        burnAmount: m.burn_amount,
        percentOfSupply: m.percent_of_supply,
        completed: m.completed === 1,
        completedAt: m.completed_at,
        txSignature: m.tx_signature,
        isEligible,
        isPending
      };
    });
    
    // Find next milestone
    const nextMilestone = enhancedMilestones.find(m => !m.completed);
    const progress = nextMilestone 
      ? Math.min(100, (currentMarketCap / nextMilestone.marketCap) * 100)
      : 100;
    
    return NextResponse.json({
      milestones: enhancedMilestones,
      currentMarketCap,
      nextMilestone: nextMilestone || null,
      progress: progress.toFixed(2),
      stats: {
        total: stats.total,
        completed: stats.completed,
        remaining: stats.total - stats.completed,
        totalBurned: stats.total_burned
      }
    });
  } catch (error) {
    console.error('Error fetching milestones:', error);
    return NextResponse.json(
      { error: 'Failed to fetch milestones' },
      { status: 500 }
    );
  }
}
