#!/usr/bin/env node
/**
 * Jupiter Ultra Swap Script
 * For buying/selling tokens after graduation (mainnet only)
 * 
 * Usage:
 *   node jup-swap.js buy 0.1     # Buy tokens with 0.1 SOL
 *   node jup-swap.js sell 1000000 # Sell 1M tokens
 *   node jup-swap.js quote 0.1   # Get quote only
 */

const { Keypair, VersionedTransaction } = require('@solana/web3.js');
const bs58 = require('bs58');
require('dotenv').config();

const SOL_MINT = 'So11111111111111111111111111111111111111112';
const JUPITER_ULTRA_API = 'https://api.jup.ag/ultra/v1';

function loadWallet() {
  const privateKey = process.env.WALLET_PRIVATE_KEY;
  if (privateKey.startsWith('[') || privateKey.includes(',')) {
    const keyArray = JSON.parse(privateKey.startsWith('[') ? privateKey : `[${privateKey}]`);
    return Keypair.fromSecretKey(new Uint8Array(keyArray));
  }
  return Keypair.fromSecretKey(bs58.decode(privateKey));
}

async function getOrder(inputMint, outputMint, amount, taker) {
  const params = new URLSearchParams({
    inputMint,
    outputMint,
    amount: amount.toString(),
    taker: taker.toString()
  });

  const response = await fetch(`${JUPITER_ULTRA_API}/order?${params}`);
  return response.json();
}

async function executeSwap(signedTransaction, requestId) {
  const response = await fetch(`${JUPITER_ULTRA_API}/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ signedTransaction, requestId })
  });
  return response.json();
}

async function buyTokens(wallet, tokenAddress, solAmount) {
  const amountLamports = Math.floor(solAmount * 1e9);
  
  console.log(`💰 Buying tokens with ${solAmount} SOL...`);
  
  const order = await getOrder(SOL_MINT, tokenAddress, amountLamports, wallet.publicKey);
  
  if (order.error || !order.transaction) {
    console.error(`❌ Error: ${order.error || order.errorMessage || 'No transaction'}`);
    return;
  }
  
  console.log(`📊 Quote:`);
  console.log(`   Input: ${solAmount} SOL`);
  console.log(`   Output: ${(parseInt(order.outAmount) / 1e6).toLocaleString()} tokens`);
  console.log(`   Router: ${order.router}`);
  console.log(`   Price Impact: ${((order.priceImpact || 0) * 100).toFixed(4)}%`);
  
  // Sign and execute
  const txBuffer = Buffer.from(order.transaction, 'base64');
  const tx = VersionedTransaction.deserialize(txBuffer);
  tx.sign([wallet]);
  
  const signedTx = Buffer.from(tx.serialize()).toString('base64');
  const result = await executeSwap(signedTx, order.requestId);
  
  if (result.status === 'Success') {
    console.log(`\n✅ Success!`);
    console.log(`   TX: ${result.signature}`);
    console.log(`   Tokens: ${result.outputAmountResult}`);
    console.log(`🔍 https://solscan.io/tx/${result.signature}`);
  } else {
    console.error(`❌ Failed: ${result.error}`);
  }
}

async function sellTokens(wallet, tokenAddress, tokenAmount) {
  const amountRaw = Math.floor(tokenAmount * 1e6); // 6 decimals
  
  console.log(`💸 Selling ${tokenAmount.toLocaleString()} tokens...`);
  
  const order = await getOrder(tokenAddress, SOL_MINT, amountRaw, wallet.publicKey);
  
  if (order.error || !order.transaction) {
    console.error(`❌ Error: ${order.error || order.errorMessage || 'No transaction'}`);
    return;
  }
  
  console.log(`📊 Quote:`);
  console.log(`   Input: ${tokenAmount.toLocaleString()} tokens`);
  console.log(`   Output: ${(parseInt(order.outAmount) / 1e9).toFixed(6)} SOL`);
  
  const txBuffer = Buffer.from(order.transaction, 'base64');
  const tx = VersionedTransaction.deserialize(txBuffer);
  tx.sign([wallet]);
  
  const signedTx = Buffer.from(tx.serialize()).toString('base64');
  const result = await executeSwap(signedTx, order.requestId);
  
  if (result.status === 'Success') {
    console.log(`\n✅ Success!`);
    console.log(`   TX: ${result.signature}`);
    console.log(`   SOL: ${(parseInt(result.outputAmountResult) / 1e9).toFixed(6)}`);
    console.log(`🔍 https://solscan.io/tx/${result.signature}`);
  } else {
    console.error(`❌ Failed: ${result.error}`);
  }
}

async function getQuote(wallet, tokenAddress, solAmount) {
  const amountLamports = Math.floor(solAmount * 1e9);
  
  console.log(`📊 Getting quote for ${solAmount} SOL...`);
  
  const order = await getOrder(SOL_MINT, tokenAddress, amountLamports, wallet.publicKey);
  
  if (order.error) {
    console.error(`❌ Error: ${order.error}`);
    return;
  }
  
  console.log(`\n💰 Quote:`);
  console.log(`   Input: ${solAmount} SOL`);
  console.log(`   Output: ${(parseInt(order.outAmount || 0) / 1e6).toLocaleString()} tokens`);
  console.log(`   Router: ${order.router}`);
  console.log(`   Price Impact: ${((order.priceImpact || 0) * 100).toFixed(4)}%`);
  console.log(`   Fee: ${order.feeBps || 0} bps`);
  console.log(`   Gasless: ${order.gasless}`);
  
  if (order.routePlan?.length > 0) {
    console.log(`   Route: ${order.routePlan.map(r => r.swapInfo.label).join(' → ')}`);
  }
}

async function main() {
  const wallet = loadWallet();
  const tokenAddress = process.env.TOKEN_ADDRESS;
  
  console.log('🚀 Jupiter Ultra Swap');
  console.log(`📍 Wallet: ${wallet.publicKey.toString()}`);
  console.log(`🪙 Token: ${tokenAddress}`);
  console.log(`⚠️  Note: Jupiter only works on mainnet!\n`);
  
  const command = process.argv[2]?.toLowerCase();
  const amount = parseFloat(process.argv[3]);
  
  switch (command) {
    case 'buy':
    case 'b':
      if (!amount) return console.log('Usage: node jup-swap.js buy 0.1');
      await buyTokens(wallet, tokenAddress, amount);
      break;
      
    case 'sell':
    case 's':
      if (!amount) return console.log('Usage: node jup-swap.js sell 1000000');
      await sellTokens(wallet, tokenAddress, amount);
      break;
      
    case 'quote':
    case 'q':
      if (!amount) return console.log('Usage: node jup-swap.js quote 0.1');
      await getQuote(wallet, tokenAddress, amount);
      break;
      
    default:
      console.log('Commands:');
      console.log('  node jup-swap.js buy 0.1     - Buy tokens with 0.1 SOL');
      console.log('  node jup-swap.js sell 1000000 - Sell 1M tokens');
      console.log('  node jup-swap.js quote 0.1   - Get quote only');
  }
}

main().catch(console.error);