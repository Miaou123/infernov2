/**
 * Metrics API Route
 * GET /api/metrics - Get token metrics and price data
 */
import { NextResponse } from 'next/server';
import { getTotalBurned, getLatestMetrics } from '@/lib/database';
import { getTokenMetrics, refreshPrice } from '@/lib/priceOracle';

export async function GET() {
  try {
    const priceData = await getTokenMetrics();
    const totalBurned = getTotalBurned();
    const latestMetrics = getLatestMetrics();
    
    const initialSupply = parseInt(process.env.INITIAL_SUPPLY) || 1000000000;
    const circulatingSupply = initialSupply - totalBurned;
    const burnPercentage = ((totalBurned / initialSupply) * 100).toFixed(2);
    
    return NextResponse.json({
      price: {
        priceInSol: priceData.priceInSol,
        priceInUsd: priceData.priceInUsd,
        solPriceUsd: priceData.solPriceUsd,
        source: priceData.source,
        isGraduated: priceData.isGraduated,
        cached: priceData.cached || false
      },
      marketCap: priceData.marketCap,
      marketCapSol: priceData.marketCapSol,
      supply: {
        initial: initialSupply,
        circulating: circulatingSupply,
        burned: totalBurned,
        burnPercentage
      },
      lastUpdate: latestMetrics?.created_at || new Date().toISOString(),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching metrics:', error);
    return NextResponse.json(
      { error: 'Failed to fetch metrics' },
      { status: 500 }
    );
  }
}

export async function POST() {
  try {
    // Force refresh price data
    const priceData = await refreshPrice();
    
    return NextResponse.json({
      success: true,
      priceData
    });
  } catch (error) {
    console.error('Error refreshing price:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to refresh price' },
      { status: 500 }
    );
  }
}
