#!/usr/bin/env node
/**
 * Test Market Cap Calculation
 * Tests the price oracle and market cap calculation
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { OnlinePumpSdk, getBuyTokenAmountFromSolAmount } = require('@pump-fun/pump-sdk');
const BN = require('bn.js');
require('dotenv').config();

async function testMarketCap() {
  console.log('🔥 Market Cap Calculator Test\n');
  
  const tokenAddress = process.env.TOKEN_ADDRESS;
  const rpcUrl = process.env.HELIUS_RPC_URL || 'https://api.devnet.solana.com';
  
  console.log(`Token: ${tokenAddress}`);
  console.log(`RPC: ${rpcUrl}\n`);
  
  const connection = new Connection(rpcUrl, 'confirmed');
  const onlineSdk = new OnlinePumpSdk(connection);
  const mint = new PublicKey(tokenAddress);
  
  try {
    // Fetch bonding curve
    console.log('📊 Fetching bonding curve...');
    const bondingCurve = await onlineSdk.fetchBondingCurve(mint);
    
    if (!bondingCurve) {
      console.log('❌ Bonding curve not found');
      return;
    }
    
    console.log('\n📈 Bonding Curve Data:');
    console.log(`  Complete (Graduated): ${bondingCurve.complete}`);
    console.log(`  Virtual Token Reserves: ${bondingCurve.virtualTokenReserves?.toString()}`);
    console.log(`  Virtual SOL Reserves: ${bondingCurve.virtualSolReserves?.toString()}`);
    console.log(`  Real Token Reserves: ${bondingCurve.realTokenReserves?.toString()}`);
    console.log(`  Real SOL Reserves: ${bondingCurve.realSolReserves?.toString()}`);
    console.log(`  Token Total Supply: ${bondingCurve.tokenTotalSupply?.toString()}`);
    
    if (bondingCurve.complete) {
      console.log('\n⚠️ Token has graduated - need to use AMM price');
      return;
    }
    
    // Fetch global state
    console.log('\n📊 Fetching global state...');
    const global = await onlineSdk.fetchGlobal();
    
    // Calculate price: how many tokens for 1 SOL
    const oneSol = new BN(1_000_000_000); // 1 SOL in lamports
    const tokenAmount = getBuyTokenAmountFromSolAmount({
      global,
      feeConfig: null,
      mintSupply: bondingCurve.realTokenReserves,
      bondingCurve,
      amount: oneSol
    });
    
    console.log(`\n💰 Price Calculation:`);
    console.log(`  1 SOL buys: ${tokenAmount.toString()} tokens (raw)`);
    console.log(`  1 SOL buys: ${(tokenAmount.toNumber() / 1e6).toLocaleString()} tokens (with 6 decimals)`);
    
    // Price per token
    const tokensPerSol = tokenAmount.toNumber() / 1e6;
    const pricePerToken = 1 / tokensPerSol;
    
    console.log(`  Price per token: ${pricePerToken.toExponential(6)} SOL`);
    console.log(`  Price per token: ${pricePerToken.toFixed(12)} SOL`);
    
    // Market cap calculation
    const totalSupply = 1_000_000_000; // 1B tokens
    const marketCapSol = pricePerToken * totalSupply;
    
    console.log(`\n🏦 Market Cap:`);
    console.log(`  Total Supply: ${totalSupply.toLocaleString()} tokens`);
    console.log(`  Market Cap: ${marketCapSol.toFixed(4)} SOL`);
    
    // Try to get SOL price in USD
    try {
      const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
      const data = await response.json();
      const solPrice = data.solana?.usd || 200;
      
      console.log(`  SOL Price: $${solPrice}`);
      console.log(`  Market Cap: $${(marketCapSol * solPrice).toLocaleString(undefined, {maximumFractionDigits: 2})}`);
    } catch (e) {
      console.log(`  (Could not fetch SOL USD price)`);
    }
    
    // Graduation progress
    const realSolReserves = bondingCurve.realSolReserves?.toNumber() / 1e9 || 0;
    const graduationThreshold = 85; // SOL needed to graduate
    const progress = (realSolReserves / graduationThreshold) * 100;
    
    console.log(`\n🎓 Graduation Progress:`);
    console.log(`  Real SOL in curve: ${realSolReserves.toFixed(4)} SOL`);
    console.log(`  Graduation at: ${graduationThreshold} SOL`);
    console.log(`  Progress: ${progress.toFixed(2)}%`);
    
    console.log('\n✅ Market cap calculation working!');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error);
  }
}

testMarketCap();