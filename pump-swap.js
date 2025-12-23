#!/usr/bin/env node
/**
 * PumpSwap AMM Test Script
 * For buying/selling graduated tokens on devnet
 * 
 * Usage:
 *   node pump-swap.js info           # Get pool info
 *   node pump-swap.js buy 0.03       # Buy tokens with 0.03 SOL
 *   node pump-swap.js sell 1000000   # Sell 1M tokens
 */

const { 
    Connection, 
    PublicKey, 
    Keypair, 
    Transaction,
    sendAndConfirmTransaction,
    ComputeBudgetProgram
  } = require('@solana/web3.js');
  const { 
    getAssociatedTokenAddress,
    createAssociatedTokenAccountInstruction,
    TOKEN_PROGRAM_ID
  } = require('@solana/spl-token');
  const bs58 = require('bs58');
  const BN = require('bn.js');
  require('dotenv').config();
  
  // Load wallet
  function loadWallet() {
    const privateKey = process.env.WALLET_PRIVATE_KEY;
    if (privateKey.startsWith('[') || privateKey.includes(',')) {
      const keyArray = JSON.parse(privateKey.startsWith('[') ? privateKey : `[${privateKey}]`);
      return Keypair.fromSecretKey(new Uint8Array(keyArray));
    } else {
      return Keypair.fromSecretKey(bs58.decode(privateKey));
    }
  }
  
  async function main() {
    const args = process.argv.slice(2);
    const command = args[0]?.toLowerCase();
    const amount = parseFloat(args[1]);
    
    const connection = new Connection(process.env.HELIUS_RPC_URL || 'https://api.devnet.solana.com', 'confirmed');
    const wallet = loadWallet();
    const tokenMint = new PublicKey(process.env.TOKEN_ADDRESS);
    
    console.log('🚀 PumpSwap AMM Test');
    console.log(`📍 Wallet: ${wallet.publicKey.toString()}`);
    console.log(`🪙 Token: ${tokenMint.toString()}`);
    console.log(`🌐 RPC: ${process.env.HELIUS_RPC_URL || 'devnet'}`);
    console.log('');
    
    // Import pump-swap-sdk
    let OnlinePumpAmmSdk, PumpAmmSdk;
    try {
      const swapSdk = require('@pump-fun/pump-swap-sdk');
      console.log('📦 pump-swap-sdk exports:', Object.keys(swapSdk));
      
      OnlinePumpAmmSdk = swapSdk.OnlinePumpAmmSdk;
      PumpAmmSdk = swapSdk.PumpAmmSdk;
      
      // Check for other useful exports
      if (swapSdk.buyQuoteInput) console.log('  ✓ buyQuoteInput available');
      if (swapSdk.sellQuoteInput) console.log('  ✓ sellQuoteInput available');
      if (swapSdk.buy) console.log('  ✓ buy available');
      if (swapSdk.sell) console.log('  ✓ sell available');
      console.log('');
    } catch (e) {
      console.error('❌ Failed to load pump-swap-sdk:', e.message);
      return;
    }
    
    // Initialize SDK
    const onlineSdk = new OnlinePumpAmmSdk(connection);
    
    switch (command) {
      case 'info':
      case 'i':
        await getPoolInfo(onlineSdk, tokenMint);
        break;
        
      case 'buy':
      case 'b':
        if (!amount || amount <= 0) {
          console.log('Usage: node pump-swap.js buy 0.03');
          return;
        }
        await buyTokens(connection, onlineSdk, wallet, tokenMint, amount);
        break;
        
      case 'sell':
      case 's':
        if (!amount || amount <= 0) {
          console.log('Usage: node pump-swap.js sell 1000000');
          return;
        }
        await sellTokens(connection, onlineSdk, wallet, tokenMint, amount);
        break;
        
      case 'debug':
      case 'd':
        await debugSdk(connection, onlineSdk, tokenMint);
        break;
        
      default:
        console.log('Commands:');
        console.log('  node pump-swap.js info         - Get pool info');
        console.log('  node pump-swap.js buy 0.03     - Buy tokens with 0.03 SOL');
        console.log('  node pump-swap.js sell 1000000 - Sell 1M tokens');
        console.log('  node pump-swap.js debug        - Debug SDK methods');
    }
  }
  
  async function getPoolInfo(sdk, mint) {
    console.log('📊 Fetching pool info...\n');
    
    try {
      const pool = await sdk.fetchPool(mint);
      
      if (!pool) {
        console.log('❌ Pool not found for this token');
        console.log('   Token may not have graduated yet');
        return null;
      }
      
      console.log('✅ Pool found!');
      console.log(`   Pool Address: ${pool.address?.toString() || 'N/A'}`);
      console.log(`   Base Mint: ${pool.baseMint?.toString() || 'N/A'}`);
      console.log(`   Quote Mint: ${pool.quoteMint?.toString() || 'N/A'}`);
      console.log(`   Base Reserve: ${pool.baseReserve?.toString() || 'N/A'}`);
      console.log(`   Quote Reserve: ${pool.quoteReserve?.toString() || 'N/A'}`);
      
      // Calculate price
      if (pool.baseReserve && pool.quoteReserve) {
        const baseReserve = pool.baseReserve.toNumber ? pool.baseReserve.toNumber() : pool.baseReserve;
        const quoteReserve = pool.quoteReserve.toNumber ? pool.quoteReserve.toNumber() : pool.quoteReserve;
        
        // Price = quoteReserve / baseReserve (SOL per token)
        const pricePerToken = (quoteReserve / 1e9) / (baseReserve / 1e6);
        console.log(`\n💰 Price: ${pricePerToken.toExponential(4)} SOL per token`);
        console.log(`   ~$${(pricePerToken * 200).toExponential(4)} USD (assuming SOL=$200)`);
      }
      
      // Show all pool properties
      console.log('\n📋 Full pool data:');
      console.log(JSON.stringify(pool, (key, value) => 
        typeof value === 'bigint' ? value.toString() : 
        value?.toNumber ? value.toNumber() : value
      , 2));
      
      return pool;
    } catch (error) {
      console.error('❌ Error fetching pool:', error.message);
      console.error(error);
      return null;
    }
  }
  
  async function buyTokens(connection, sdk, wallet, mint, solAmount) {
    console.log(`💰 Buying tokens with ${solAmount} SOL...\n`);
    
    try {
      const { buyQuoteInput } = require('@pump-fun/pump-swap-sdk');
      
      // Get pool
      const pool = await sdk.fetchPool(mint);
      if (!pool) {
        throw new Error('Pool not found');
      }
      
      const solLamports = Math.floor(solAmount * 1e9);
      
      // Calculate expected tokens
      const baseReserve = pool.baseReserve.toNumber ? pool.baseReserve.toNumber() : Number(pool.baseReserve);
      const quoteReserve = pool.quoteReserve.toNumber ? pool.quoteReserve.toNumber() : Number(pool.quoteReserve);
      
      console.log(`📊 Pool State:`);
      console.log(`   Base Reserve: ${baseReserve}`);
      console.log(`   Quote Reserve: ${quoteReserve}`);
      
      const expectedTokens = buyQuoteInput({
        quote: solLamports,
        slippage: 15, // 15% slippage for safety
        baseReserve,
        quoteReserve,
        feeRateBps: 2500 // 25% fee on pump.fun AMM
      });
      
      console.log(`\n📈 Swap Quote:`);
      console.log(`   Input: ${solAmount} SOL`);
      console.log(`   Expected Output: ${(expectedTokens / 1e6).toLocaleString()} tokens`);
      
      // Ensure ATA exists
      const userAta = await getAssociatedTokenAddress(mint, wallet.publicKey);
      const ataInfo = await connection.getAccountInfo(userAta);
      
      const tx = new Transaction();
      
      // Add compute budget
      tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 300000 }));
      tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50000 }));
      
      // Create ATA if needed
      if (!ataInfo) {
        console.log(`   Creating token account...`);
        tx.add(createAssociatedTokenAccountInstruction(
          wallet.publicKey,
          userAta,
          wallet.publicKey,
          mint
        ));
      }
      
      // Get buy instructions
      console.log(`\n⏳ Building swap transaction...`);
      
      const buyIxs = await sdk.buyInstructions({
        pool,
        user: wallet.publicKey,
        quoteAmount: new BN(solLamports),
        minBaseAmount: new BN(Math.floor(expectedTokens * 0.85)) // 15% slippage
      });
      
      buyIxs.forEach(ix => tx.add(ix));
      
      // Send transaction
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = wallet.publicKey;
      
      console.log(`📤 Sending transaction...`);
      const signature = await sendAndConfirmTransaction(connection, tx, [wallet], {
        commitment: 'confirmed',
        maxRetries: 3
      });
      
      console.log(`\n✅ Buy successful!`);
      console.log(`   TX: ${signature}`);
      console.log(`🔍 https://solscan.io/tx/${signature}?cluster=devnet`);
      
      return { success: true, signature, tokensReceived: expectedTokens };
      
    } catch (error) {
      console.error('\n❌ Buy failed:', error.message);
      console.error(error);
      return { success: false, error: error.message };
    }
  }
  
  async function sellTokens(connection, sdk, wallet, mint, tokenAmount) {
    console.log(`💸 Selling ${tokenAmount.toLocaleString()} tokens...\n`);
    
    try {
      const { sellQuoteInput } = require('@pump-fun/pump-swap-sdk');
      
      // Get pool
      const pool = await sdk.fetchPool(mint);
      if (!pool) {
        throw new Error('Pool not found');
      }
      
      const tokenAmountRaw = Math.floor(tokenAmount * 1e6); // 6 decimals
      
      const baseReserve = pool.baseReserve.toNumber ? pool.baseReserve.toNumber() : Number(pool.baseReserve);
      const quoteReserve = pool.quoteReserve.toNumber ? pool.quoteReserve.toNumber() : Number(pool.quoteReserve);
      
      // Calculate expected SOL
      const expectedSol = sellQuoteInput({
        base: tokenAmountRaw,
        slippage: 15,
        baseReserve,
        quoteReserve,
        feeRateBps: 2500
      });
      
      console.log(`📉 Swap Quote:`);
      console.log(`   Input: ${tokenAmount.toLocaleString()} tokens`);
      console.log(`   Expected Output: ${(expectedSol / 1e9).toFixed(6)} SOL`);
      
      const tx = new Transaction();
      
      // Add compute budget
      tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 300000 }));
      tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50000 }));
      
      // Get sell instructions
      console.log(`\n⏳ Building swap transaction...`);
      
      const sellIxs = await sdk.sellInstructions({
        pool,
        user: wallet.publicKey,
        baseAmount: new BN(tokenAmountRaw),
        minQuoteAmount: new BN(Math.floor(expectedSol * 0.85))
      });
      
      sellIxs.forEach(ix => tx.add(ix));
      
      // Send transaction
      const { blockhash } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = wallet.publicKey;
      
      console.log(`📤 Sending transaction...`);
      const signature = await sendAndConfirmTransaction(connection, tx, [wallet], {
        commitment: 'confirmed',
        maxRetries: 3
      });
      
      console.log(`\n✅ Sell successful!`);
      console.log(`   TX: ${signature}`);
      console.log(`🔍 https://solscan.io/tx/${signature}?cluster=devnet`);
      
      return { success: true, signature, solReceived: expectedSol / 1e9 };
      
    } catch (error) {
      console.error('\n❌ Sell failed:', error.message);
      console.error(error);
      return { success: false, error: error.message };
    }
  }
  
  async function debugSdk(connection, sdk, mint) {
    console.log('🔧 Debugging SDK...\n');
    
    // List all SDK methods
    console.log('SDK Methods:');
    const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(sdk));
    methods.forEach(m => {
      if (m !== 'constructor') {
        console.log(`  - ${m}`);
      }
    });
    
    // Try different ways to fetch pool
    console.log('\n📊 Trying to fetch pool...');
    
    try {
      console.log('\n1. sdk.fetchPool(mint):');
      const pool1 = await sdk.fetchPool(mint);
      console.log('   Result:', pool1 ? 'Pool found' : 'null');
      if (pool1) {
        console.log('   Keys:', Object.keys(pool1));
      }
    } catch (e) {
      console.log('   Error:', e.message);
    }
    
    // Check pump-swap-sdk exports
    console.log('\n📦 pump-swap-sdk full exports:');
    const swapSdk = require('@pump-fun/pump-swap-sdk');
    Object.keys(swapSdk).forEach(key => {
      const type = typeof swapSdk[key];
      console.log(`  - ${key}: ${type}`);
    });
  }
  
  main().catch(console.error);