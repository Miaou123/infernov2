/**
 * $INFERNO Configuration
 * 
 * Fetches token metadata from chain and derives addresses using PumpFun SDK.
 * Only TOKEN_ADDRESS and WALLET_PRIVATE_KEY needed in .env
 */
const { PublicKey } = require('@solana/web3.js');
const { getMint } = require('@solana/spl-token');
require('dotenv').config();

// ========================================
// Static Constants (never change)
// ========================================

const CONSTANTS = {
  // Milestone burn schedule
  BURN_SCHEDULE: [
    { marketCap: 10000, burnAmount: 10000000, percentOfSupply: 1.00 },
    { marketCap: 50000, burnAmount: 15000000, percentOfSupply: 1.50 },
    { marketCap: 100000, burnAmount: 25000000, percentOfSupply: 2.50 },
    { marketCap: 200000, burnAmount: 20000000, percentOfSupply: 2.00 },
    { marketCap: 300000, burnAmount: 17500000, percentOfSupply: 1.75 },
    { marketCap: 500000, burnAmount: 17500000, percentOfSupply: 1.75 },
    { marketCap: 750000, burnAmount: 15000000, percentOfSupply: 1.50 },
    { marketCap: 1000000, burnAmount: 15000000, percentOfSupply: 1.50 },
    { marketCap: 1500000, burnAmount: 10000000, percentOfSupply: 1.00 },
    { marketCap: 2500000, burnAmount: 10000000, percentOfSupply: 1.00 },
    { marketCap: 3500000, burnAmount: 7500000, percentOfSupply: 0.75 },
    { marketCap: 5000000, burnAmount: 7500000, percentOfSupply: 0.75 },
    { marketCap: 7500000, burnAmount: 7500000, percentOfSupply: 0.75 },
    { marketCap: 10000000, burnAmount: 7500000, percentOfSupply: 0.75 },
    { marketCap: 15000000, burnAmount: 5000000, percentOfSupply: 0.50 },
    { marketCap: 25000000, burnAmount: 5000000, percentOfSupply: 0.50 },
    { marketCap: 35000000, burnAmount: 5000000, percentOfSupply: 0.50 },
    { marketCap: 50000000, burnAmount: 5000000, percentOfSupply: 0.50 },
    { marketCap: 75000000, burnAmount: 7500000, percentOfSupply: 0.75 },
    { marketCap: 90000000, burnAmount: 7500000, percentOfSupply: 0.75 },
    { marketCap: 100000000, burnAmount: 30000000, percentOfSupply: 3.00 }
  ],
  
  // Default operational settings (can override in .env)
  DEFAULTS: {
    REWARDS_CLAIM_THRESHOLD: 0.001,      // Minimum SOL to trigger buyback
    BUYBACK_INTERVAL_MINUTES: 15,       // How often to check for rewards
    MILESTONE_CHECK_INTERVAL_MINUTES: 5, // How often to check price
    MAX_SLIPPAGE_PERCENT: 10,           // Max slippage for swaps
    PORT: 3000
  },
  
  // PumpFun program IDs
  PROGRAMS: {
    PUMP_FUN: new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P'),
    PUMP_AMM: new PublicKey('pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA')
  }
};

// ========================================
// Cached token metadata (fetched once)
// ========================================

let cachedTokenMetadata = null;
let cachedDerivedAddresses = null;

/**
 * Fetch token metadata from PumpFun/chain
 */
async function fetchTokenMetadata(connection) {
  if (cachedTokenMetadata) return cachedTokenMetadata;
  
  const tokenAddress = process.env.TOKEN_ADDRESS;
  if (!tokenAddress) throw new Error('TOKEN_ADDRESS not set in .env');
  
  const mint = new PublicKey(tokenAddress);
  
  try {
    // Get on-chain mint info
    const mintInfo = await getMint(connection, mint);
    
    // Try to get PumpFun metadata
    let name = 'INFERNO';
    let symbol = 'INFERNO';
    let uri = null;
    
    try {
      const { OnlinePumpSdk } = require('@pump-fun/pump-sdk');
      const sdk = new OnlinePumpSdk(connection);
      const bondingCurve = await sdk.fetchBondingCurve(mint);
      
      if (bondingCurve) {
        // Fetch metadata from URI if available
        // PumpFun stores metadata URI in the bonding curve or associated metadata account
        const metadataUri = bondingCurve.uri || null;
        
        if (metadataUri) {
          try {
            const response = await fetch(metadataUri);
            const metadata = await response.json();
            name = metadata.name || name;
            symbol = metadata.symbol || symbol;
            uri = metadataUri;
          } catch (e) {
            console.log('Could not fetch metadata URI, using defaults');
          }
        }
      }
    } catch (e) {
      console.log('PumpFun SDK not available or token graduated, using on-chain data');
    }
    
    cachedTokenMetadata = {
      address: tokenAddress,
      name,
      symbol,
      decimals: mintInfo.decimals,
      supply: Number(mintInfo.supply),
      uri,
      mintAuthority: mintInfo.mintAuthority?.toString() || null,
      freezeAuthority: mintInfo.freezeAuthority?.toString() || null
    };
    
    console.log(`Token metadata loaded: ${symbol} (${name})`);
    return cachedTokenMetadata;
    
  } catch (error) {
    console.error('Error fetching token metadata:', error.message);
    
    // Return defaults if fetch fails
    return {
      address: tokenAddress,
      name: 'INFERNO',
      symbol: 'INFERNO', 
      decimals: 6,
      supply: 1000000000,
      uri: null
    };
  }
}

/**
 * Derive PumpFun pool and vault addresses from token mint
 */
async function deriveAddresses(connection) {
  if (cachedDerivedAddresses) return cachedDerivedAddresses;
  
  const tokenAddress = process.env.TOKEN_ADDRESS;
  if (!tokenAddress) throw new Error('TOKEN_ADDRESS not set in .env');
  
  const mint = new PublicKey(tokenAddress);
  
  try {
    const { OnlinePumpSdk } = require('@pump-fun/pump-sdk');
    const { OnlineAmmSdk } = require('@pump-fun/pump-swap-sdk');
    
    const pumpSdk = new OnlinePumpSdk(connection);
    const ammSdk = new OnlineAmmSdk(connection);
    
    // Derive bonding curve PDA
    const [bondingCurvePda] = PublicKey.findProgramAddressSync(
      [Buffer.from('bonding-curve'), mint.toBuffer()],
      CONSTANTS.PROGRAMS.PUMP_FUN
    );
    
    // Check if token is graduated (on AMM)
    let poolAddress = null;
    let isGraduated = false;
    
    try {
      const bondingCurve = await pumpSdk.fetchBondingCurve(mint);
      isGraduated = !bondingCurve || bondingCurve.complete;
      
      if (isGraduated) {
        // Get AMM pool address
        const pool = await ammSdk.fetchPool(mint);
        if (pool) {
          poolAddress = pool.address?.toString();
        }
      }
    } catch (e) {
      isGraduated = true; // Assume graduated if bonding curve not found
    }
    
    // Derive creator vault PDA for pAMMBay
    const [creatorVaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('creator-vault'), mint.toBuffer()],
      CONSTANTS.PROGRAMS.PUMP_AMM
    );
    
    cachedDerivedAddresses = {
      mint: tokenAddress,
      bondingCurve: bondingCurvePda.toString(),
      creatorVault: creatorVaultPda.toString(),
      pool: poolAddress,
      isGraduated
    };
    
    console.log(`Derived addresses for ${tokenAddress}:`);
    console.log(`  Bonding Curve: ${cachedDerivedAddresses.bondingCurve}`);
    console.log(`  Creator Vault: ${cachedDerivedAddresses.creatorVault}`);
    console.log(`  Pool: ${cachedDerivedAddresses.pool || 'N/A (not graduated)'}`);
    console.log(`  Graduated: ${isGraduated}`);
    
    return cachedDerivedAddresses;
    
  } catch (error) {
    console.error('Error deriving addresses:', error.message);
    throw error;
  }
}

/**
 * Get operational settings (from .env or defaults)
 */
function getSettings() {
  return {
    rewardThreshold: parseFloat(process.env.REWARDS_CLAIM_THRESHOLD) || CONSTANTS.DEFAULTS.REWARDS_CLAIM_THRESHOLD,
    buybackInterval: parseInt(process.env.BUYBACK_INTERVAL_MINUTES) || CONSTANTS.DEFAULTS.BUYBACK_INTERVAL_MINUTES,
    milestoneInterval: parseInt(process.env.MILESTONE_CHECK_INTERVAL_MINUTES) || CONSTANTS.DEFAULTS.MILESTONE_CHECK_INTERVAL_MINUTES,
    maxSlippage: parseFloat(process.env.MAX_SLIPPAGE_PERCENT) || CONSTANTS.DEFAULTS.MAX_SLIPPAGE_PERCENT,
    port: parseInt(process.env.PORT) || CONSTANTS.DEFAULTS.PORT
  };
}

/**
 * Initialize config - call this once at startup
 */
async function initConfig(connection) {
  console.log('Initializing configuration...');
  
  const metadata = await fetchTokenMetadata(connection);
  const addresses = await deriveAddresses(connection);
  const settings = getSettings();
  
  return {
    token: metadata,
    addresses,
    settings,
    burnSchedule: CONSTANTS.BURN_SCHEDULE
  };
}

/**
 * Format helpers
 */
function formatMarketCap(value) {
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
  return `$${value}`;
}

function formatTokenAmount(amount) {
  if (amount >= 1000000) return `${(amount / 1000000).toFixed(2)}M`;
  if (amount >= 1000) return `${(amount / 1000).toFixed(0)}K`;
  return amount.toLocaleString();
}

module.exports = {
  CONSTANTS,
  fetchTokenMetadata,
  deriveAddresses,
  getSettings,
  initConfig,
  formatMarketCap,
  formatTokenAmount
};