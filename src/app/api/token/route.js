/**
 * Token API Route
 * GET /api/token - Get token address and basic info
 */
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const tokenAddress = process.env.TOKEN_ADDRESS || 'coming soon';
    const burnAddress = process.env.BURN_ADDRESS || '1nc1nerator11111111111111111111111111111111';
    const reserveWallet = process.env.RESERVE_WALLET_ADDRESS || null;
    
    return NextResponse.json({
      success: true,
      tokenAddress,
      burnAddress,
      reserveWallet,
      name: process.env.TOKEN_NAME || '$INFERNO',
      symbol: process.env.TOKEN_SYMBOL || 'INFERNO',
      initialSupply: parseInt(process.env.INITIAL_SUPPLY) || 1000000000,
      network: 'solana'
    });
  } catch (error) {
    console.error('Error fetching token info:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch token info' },
      { status: 500 }
    );
  }
}
