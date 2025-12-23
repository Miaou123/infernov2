#!/usr/bin/env node
/**
 * Test Price Oracle
 * Tests all price sources: Bonding Curve, Jupiter, DexScreener
 */

require('dotenv').config();

const {
  getTokenPrice,
  getSolPriceInUsd,
  getPriceFromBondingCurve,
  getPriceFromJupiter,
  getPriceFromDexScreener,
  isTokenGraduated
} = require('./src/lib/priceOracle');

async function testPriceOracle() {
  const tokenAddress = process.env.TOKEN_ADDRESS;
  
  console.log('🔥 Price Oracle Test\n');
  console.log(`Token: ${tokenAddress}\n`);
  console.log('='.repeat(50));
  
  // Test SOL price
  console.log('\n📊 SOL Price (Jupiter/DexScreener):');
  const solPrice = await getSolPriceInUsd();
  console.log(`  $${solPrice.toFixed(2)} USD`);
  
  // Check graduation status
  console.log('\n📊 Graduation Status:');
  const graduated = await isTokenGraduated(tokenAddress);
  console.log(`  Graduated: ${graduated ? 'YES' : 'NO'}`);
  
  // Test bonding curve
  console.log('\n📊 Bonding Curve Price:');
  const bcPrice = await getPriceFromBondingCurve(tokenAddress);
  if (bcPrice) {
    console.log(`  Price: ${bcPrice.priceInSol.toExponential(4)} SOL`);
    console.log(`  Price: $${bcPrice.priceInUsd.toExponential(4)} USD`);
    console.log(`  Market Cap: ${bcPrice.marketCapSol.toFixed(2)} SOL`);
    console.log(`  Market Cap: $${bcPrice.marketCap.toLocaleString(undefined, {maximumFractionDigits: 2})} USD`);
    console.log(`  Graduation: ${bcPrice.graduationProgress?.toFixed(2)}%`);
  } else {
    console.log('  Not available (token may have graduated)');
  }
  
  // Test Jupiter
  console.log('\n📊 Jupiter Price:');
  const jupPrice = await getPriceFromJupiter(tokenAddress);
  if (jupPrice) {
    console.log(`  Price: ${jupPrice.priceInSol.toExponential(4)} SOL`);
    console.log(`  Price: $${jupPrice.priceInUsd.toExponential(4)} USD`);
    console.log(`  Market Cap: $${jupPrice.marketCap.toLocaleString(undefined, {maximumFractionDigits: 2})} USD`);
    if (jupPrice.priceChange24h) {
      console.log(`  24h Change: ${jupPrice.priceChange24h.toFixed(2)}%`);
    }
  } else {
    console.log('  Not available (token may not be on Jupiter yet)');
  }
  
  // Test DexScreener
  console.log('\n📊 DexScreener Price:');
  const dexPrice = await getPriceFromDexScreener(tokenAddress);
  if (dexPrice) {
    console.log(`  Price: ${dexPrice.priceInSol.toExponential(4)} SOL`);
    console.log(`  Price: $${dexPrice.priceInUsd.toExponential(4)} USD`);
    console.log(`  Market Cap: $${dexPrice.marketCap.toLocaleString(undefined, {maximumFractionDigits: 2})} USD`);
    if (dexPrice.liquidity) {
      console.log(`  Liquidity: $${parseFloat(dexPrice.liquidity).toLocaleString()}`);
    }
  } else {
    console.log('  Not available (no DEX pairs found)');
  }
  
  // Test main function (auto-selects best source)
  console.log('\n📊 Auto-Selected Price (getTokenPrice):');
  const autoPrice = await getTokenPrice(tokenAddress);
  console.log(`  Source: ${autoPrice.source}`);
  console.log(`  Price: ${autoPrice.priceInSol.toExponential(4)} SOL`);
  console.log(`  Price: $${autoPrice.priceInUsd.toExponential(4)} USD`);
  console.log(`  Market Cap: $${autoPrice.marketCap.toLocaleString(undefined, {maximumFractionDigits: 2})} USD`);
  
  console.log('\n' + '='.repeat(50));
  console.log('✅ Price oracle test complete!');
}

testPriceOracle().catch(console.error);