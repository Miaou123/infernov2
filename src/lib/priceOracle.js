/**
 * Price Oracle for $INFERNO Token
 * 
 * Price Sources (in order of priority):
 * 1. PumpFun Bonding Curve (pre-graduation)
 * 2. Jupiter Price API V3 (post-graduation, primary)
 * 3. DexScreener (fallback)
 */
const { PublicKey } = require('@solana/web3.js');
const { getConnection } = require('./solana');
require('dotenv').config();

// Cache configuration
const CACHE_TTL_MS = 30000; // 30 seconds
let priceCache = {
  data: null,
  timestamp: 0
};
let solPriceCache = {
  price: null,
  timestamp: 0
};

/**
 * Fetch with timeout
 */
async function fetchWithTimeout(url, options = {}, timeout = 10000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
}

/**
 * Get SOL price in USD from Jupiter
 */
async function getSolPriceInUsd() {
  const now = Date.now();
  
  // Return cached if fresh
  if (solPriceCache.price && (now - solPriceCache.timestamp) < CACHE_TTL_MS) {
    return solPriceCache.price;
  }
  
  try {
    // Try Jupiter first
    const response = await fetchWithTimeout(
      'https://api.jup.ag/price/v3?ids=So11111111111111111111111111111111111111112'
    );
    const data = await response.json();
    
    if (data['So11111111111111111111111111111111111111112']?.usdPrice) {
      const price = data['So11111111111111111111111111111111111111112'].usdPrice;
      solPriceCache = { price, timestamp: now };
      return price;
    }
  } catch (error) {
    console.log('Jupiter SOL price failed, trying DexScreener...');
  }
  
  try {
    // Fallback to DexScreener
    const response = await fetchWithTimeout(
      'https://api.dexscreener.com/latest/dex/tokens/So11111111111111111111111111111111111111112'
    );
    const data = await response.json();
    
    if (data?.pairs?.length > 0) {
      const price = parseFloat(data.pairs[0].priceUsd);
      solPriceCache = { price, timestamp: now };
      return price;
    }
  } catch (error) {
    console.log('DexScreener SOL price failed');
  }
  
  // Return last known or default
  return solPriceCache.price || 200;
}

/**
 * Check if token has graduated from bonding curve
 */
async function isTokenGraduated(tokenAddress) {
  try {
    const { OnlinePumpSdk } = require('@pump-fun/pump-sdk');
    const connection = getConnection();
    const sdk = new OnlinePumpSdk(connection);
    const mint = new PublicKey(tokenAddress);
    
    const bondingCurve = await sdk.fetchBondingCurve(mint);
    return !bondingCurve || bondingCurve.complete;
  } catch (error) {
    console.log('Could not check graduation status:', error.message);
    return true; // Assume graduated on error
  }
}

/**
 * Get price from PumpFun bonding curve (pre-graduation)
 */
async function getPriceFromBondingCurve(tokenAddress) {
  try {
    const { OnlinePumpSdk, getBuyTokenAmountFromSolAmount } = require('@pump-fun/pump-sdk');
    const BN = require('bn.js');
    const connection = getConnection();
    const sdk = new OnlinePumpSdk(connection);
    const mint = new PublicKey(tokenAddress);
    
    const bondingCurve = await sdk.fetchBondingCurve(mint);
    
    if (!bondingCurve || bondingCurve.complete) {
      return null; // Token graduated
    }
    
    const global = await sdk.fetchGlobal();
    
    // Calculate: how many tokens for 1 SOL
    const oneSol = new BN(1_000_000_000);
    const tokenAmount = getBuyTokenAmountFromSolAmount({
      global,
      feeConfig: null,
      mintSupply: bondingCurve.realTokenReserves,
      bondingCurve,
      amount: oneSol
    });
    
    // Price per token = 1 SOL / tokens received
    const tokensPerSol = tokenAmount.toNumber() / 1e6; // 6 decimals
    const priceInSol = 1 / tokensPerSol;
    
    const solPriceUsd = await getSolPriceInUsd();
    const totalSupply = 1_000_000_000; // 1B tokens
    const marketCapSol = priceInSol * totalSupply;
    
    return {
      priceInSol,
      priceInUsd: priceInSol * solPriceUsd,
      solPriceUsd,
      marketCap: marketCapSol * solPriceUsd,
      marketCapSol,
      source: 'bonding_curve',
      isGraduated: false,
      realSolReserves: bondingCurve.realSolReserves?.toNumber() / 1e9,
      graduationProgress: (bondingCurve.realSolReserves?.toNumber() / 1e9 / 85) * 100
    };
  } catch (error) {
    console.log('Bonding curve price error:', error.message);
    return null;
  }
}

/**
 * Get price from Jupiter Price API V3 (post-graduation, primary)
 */
async function getPriceFromJupiter(tokenAddress) {
  try {
    const response = await fetchWithTimeout(
      `https://api.jup.ag/price/v3?ids=${tokenAddress}`
    );
    const data = await response.json();
    
    const tokenData = data[tokenAddress];
    if (!tokenData?.usdPrice) {
      return null;
    }
    
    const solPriceUsd = await getSolPriceInUsd();
    const priceInUsd = tokenData.usdPrice;
    const priceInSol = priceInUsd / solPriceUsd;
    
    const totalSupply = 1_000_000_000; // 1B tokens
    const marketCap = priceInUsd * totalSupply;
    
    return {
      priceInSol,
      priceInUsd,
      solPriceUsd,
      marketCap,
      marketCapSol: marketCap / solPriceUsd,
      source: 'jupiter',
      isGraduated: true,
      priceChange24h: tokenData.priceChange24h || null
    };
  } catch (error) {
    console.log('Jupiter price error:', error.message);
    return null;
  }
}

/**
 * Get price from DexScreener (fallback)
 */
async function getPriceFromDexScreener(tokenAddress) {
  try {
    const response = await fetchWithTimeout(
      `https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`
    );
    const data = await response.json();
    
    if (!data?.pairs?.length) {
      console.log('No DEX pairs found on DexScreener');
      return null;
    }
    
    // Get the pair with highest liquidity
    const bestPair = data.pairs.reduce((best, pair) => {
      const liquidity = parseFloat(pair.liquidity?.usd || 0);
      const bestLiquidity = parseFloat(best?.liquidity?.usd || 0);
      return liquidity > bestLiquidity ? pair : best;
    }, data.pairs[0]);
    
    const priceInUsd = parseFloat(bestPair.priceUsd);
    const solPriceUsd = await getSolPriceInUsd();
    const priceInSol = priceInUsd / solPriceUsd;
    
    const totalSupply = 1_000_000_000;
    const marketCap = priceInUsd * totalSupply;
    
    return {
      priceInSol,
      priceInUsd,
      solPriceUsd,
      marketCap,
      marketCapSol: marketCap / solPriceUsd,
      source: 'dexscreener',
      isGraduated: true,
      liquidity: bestPair.liquidity?.usd,
      volume24h: bestPair.volume?.h24,
      priceChange24h: bestPair.priceChange?.h24
    };
  } catch (error) {
    console.log('DexScreener price error:', error.message);
    return null;
  }
}

/**
 * Get token price - main function
 * Tries sources in order: Bonding Curve → Jupiter → DexScreener
 */
async function getTokenPrice(tokenAddress = process.env.TOKEN_ADDRESS) {
  const now = Date.now();
  
  // Return cached if fresh
  if (priceCache.data && (now - priceCache.timestamp) < CACHE_TTL_MS) {
    return priceCache.data;
  }
  
  // 1. Try bonding curve first (pre-graduation)
  const bondingPrice = await getPriceFromBondingCurve(tokenAddress);
  if (bondingPrice) {
    priceCache = { data: bondingPrice, timestamp: now };
    return bondingPrice;
  }
  
  // 2. Token graduated - try Jupiter
  const jupiterPrice = await getPriceFromJupiter(tokenAddress);
  if (jupiterPrice) {
    priceCache = { data: jupiterPrice, timestamp: now };
    return jupiterPrice;
  }
  
  // 3. Fallback to DexScreener
  const dexPrice = await getPriceFromDexScreener(tokenAddress);
  if (dexPrice) {
    priceCache = { data: dexPrice, timestamp: now };
    return dexPrice;
  }
  
  // 4. Return last known or mock data
  if (priceCache.data) {
    console.log('Using cached price data');
    return priceCache.data;
  }
  
  console.log('No price data available, using defaults');
  return {
    priceInSol: 0,
    priceInUsd: 0,
    solPriceUsd: await getSolPriceInUsd(),
    marketCap: 0,
    marketCapSol: 0,
    source: 'none',
    isGraduated: false
  };
}

/**
 * Get market cap in USD
 */
async function getMarketCap(tokenAddress = process.env.TOKEN_ADDRESS) {
  const priceData = await getTokenPrice(tokenAddress);
  return priceData.marketCap || 0;
}

/**
 * Get market cap in SOL
 */
async function getMarketCapInSol(tokenAddress = process.env.TOKEN_ADDRESS) {
  const priceData = await getTokenPrice(tokenAddress);
  return priceData.marketCapSol || 0;
}

/**
 * Clear price cache
 */
function clearPriceCache() {
  priceCache = { data: null, timestamp: 0 };
  solPriceCache = { price: null, timestamp: 0 };
}

/**
 * Get token metrics (alias for getTokenPrice, for API compatibility)
 */
async function getTokenMetrics(tokenAddress = process.env.TOKEN_ADDRESS) {
  return await getTokenPrice(tokenAddress);
}

/**
 * Force refresh price data (clears cache and fetches fresh)
 */
async function refreshPrice(tokenAddress = process.env.TOKEN_ADDRESS) {
  clearPriceCache();
  return await getTokenPrice(tokenAddress);
}

module.exports = {
  getTokenPrice,
  getMarketCap,
  getMarketCapInSol,
  getSolPriceInUsd,
  isTokenGraduated,
  getPriceFromBondingCurve,
  getPriceFromJupiter,
  getPriceFromDexScreener,
  clearPriceCache,
  getTokenMetrics,
  refreshPrice
};