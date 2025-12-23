#!/usr/bin/env node
/**
 * Buyback and Burn Script for $INFERNO Token
 * 
 * This script runs every 15 minutes to:
 * 1. Check for available creator rewards
 * 2. Collect the rewards
 * 3. Use them to buy back tokens
 * 4. Burn the purchased tokens
 * 5. Record the burn in the database
 * 
 * Includes crash recovery - safe to restart at any time
 */
const cron = require('node-cron');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const { initDatabase, recordBurn, saveMetrics, getTotalBurned, getBurnsByType, getDb } = require('../lib/database');
const { getConnection, createKeypair, burnTokens, getTokenBalance, getSolBalance } = require('../lib/solana');
const { createPumpFunOperations } = require('../lib/pumpfun');
const { getMarketCap, getTokenPrice, getSolPriceInUsd } = require('../lib/priceOracle');
const { getSettings } = require('../lib/config');
const { 
  startBuybackOp, 
  updateBuybackOp, 
  completeBuybackOp, 
  checkPendingOps,
  burnTxExists,
  OP_STATES 
} = require('../lib/recovery');

// Get settings from config
const settings = getSettings();
const REWARD_THRESHOLD = settings.rewardThreshold;
const CHECK_INTERVAL = settings.buybackInterval;
const MAX_SLIPPAGE = settings.maxSlippage;

let isProcessing = false;

/**
 * Log with timestamp
 */
function log(message, level = 'info') {
  const timestamp = new Date().toISOString();
  const prefix = level === 'error' ? '❌' : level === 'warn' ? '⚠️' : '🔥';
  console.log(`[${timestamp}] ${prefix} [BUYBACK] ${message}`);
}

/**
 * Handle recovery of incomplete operations
 */
async function handleRecovery(recovery, keypair, tokenAddress) {
  if (!recovery.buyback) return false;
  
  const { action, tokensBought, tx } = recovery.buyback;
  
  if (action === 'mark_complete') {
    log('Completing previously verified burn...');
    const db = getDb();
    if (!burnTxExists(db, tx)) {
      // Record the burn that was verified on-chain but not in DB
      const marketCap = await getMarketCap();
      const tokenPrice = await getTokenPrice();
      const solPrice = await getSolPriceInUsd();
      
      recordBurn({
        burnType: 'buyback',
        burnAmount: tokensBought || 0,
        txSignature: tx,
        marketCap,
        solPrice,
        tokenPrice: tokenPrice.priceInUsd,
        solSpent: 0,
        tokensBought: tokensBought || 0
      });
      log(`Recovered burn record: ${tx}`);
    }
    completeBuybackOp();
    return true;
  }
  
  if (action === 'burn_tokens' && tokensBought) {
    log(`Recovering: burning ${tokensBought} tokens from incomplete buyback...`);
    const tokensToBurn = Math.floor(parseInt(tokensBought) * 0.99);
    
    const burnResult = await burnTokens(keypair, tokensToBurn, tokenAddress, 'buyback');
    
    if (burnResult.success) {
      log(`Recovery burn complete! TX: ${burnResult.signature}`);
      
      const marketCap = await getMarketCap();
      const tokenPrice = await getTokenPrice();
      const solPrice = await getSolPriceInUsd();
      
      recordBurn({
        burnType: 'buyback',
        burnAmount: tokensToBurn,
        txSignature: burnResult.signature,
        marketCap,
        solPrice,
        tokenPrice: tokenPrice.priceInUsd,
        solSpent: 0,
        tokensBought: parseInt(tokensBought)
      });
      
      completeBuybackOp();
      return true;
    } else {
      log(`Recovery burn failed: ${burnResult.error}`, 'error');
      return false;
    }
  }
  
  if (action === 'clear') {
    completeBuybackOp();
    log('Cleared incomplete buyback state');
    return true;
  }
  
  return false;
}

/**
 * Main buyback and burn cycle
 */
async function executeBuybackCycle() {
  if (isProcessing) {
    log('Cycle already in progress, skipping...', 'warn');
    return;
  }
  
  isProcessing = true;
  const startTime = Date.now();
  
  try {
    log('=== Starting Buyback & Burn Cycle ===');
    
    // Initialize
    const connection = getConnection();
    const keypair = createKeypair();
    const pumpOps = createPumpFunOperations(connection);
    const tokenAddress = process.env.TOKEN_ADDRESS;
    
    if (!tokenAddress) {
      throw new Error('TOKEN_ADDRESS not configured');
    }
    
    // Step 1: Check creator fee balance
    log('Step 1: Checking creator fee balance...');
    const feeBalance = await pumpOps.getCreatorFeeBalance(keypair.publicKey.toString());
    log(`Creator fee balance: ${feeBalance.toFixed(6)} SOL`);
    
    if (feeBalance < REWARD_THRESHOLD) {
      log(`Balance below threshold (${REWARD_THRESHOLD} SOL), skipping cycle`);
      return;
    }
    
    // Start tracking this operation
    startBuybackOp(feeBalance);
    
    // Step 2: Record SOL balance BEFORE collecting
    const solBalanceBefore = await getSolBalance(keypair.publicKey.toString());
    log(`Wallet SOL balance before: ${solBalanceBefore.toFixed(6)} SOL`);
    
    // Step 3: Collect creator fees
    log('Step 2: Collecting creator fees...');
    const collectResult = await pumpOps.collectCreatorFees(keypair);
    
    if (!collectResult.success) {
      updateBuybackOp({ state: OP_STATES.FAILED, error: collectResult.error });
      throw new Error(`Fee collection failed: ${collectResult.error}`);
    }
    
    updateBuybackOp({ state: OP_STATES.FEES_COLLECTED, collectTx: collectResult.signature });
    log(`Fees collected! TX: ${collectResult.signature}`);
    
    // Wait for settlement
    await new Promise(r => setTimeout(r, 3000));
    
    // Step 3: Calculate actual collected amount
    const solBalanceAfter = await getSolBalance(keypair.publicKey.toString());
    const collectedAmount = solBalanceAfter - solBalanceBefore;
    
    if (collectedAmount <= 0) {
      log(`No SOL received from fee collection, skipping buyback`);
      completeBuybackOp();
      return;
    }
    
    // Use collected amount minus gas buffer
    const buybackAmount = Math.max(0, collectedAmount - 0.005); // Keep 0.005 SOL for gas
    
    if (buybackAmount <= 0) {
      log(`Collected amount too small for buyback after gas buffer`);
      completeBuybackOp();
      return;
    }
    
    log(`Step 3: Performing buyback with ${buybackAmount.toFixed(6)} SOL (collected: ${collectedAmount.toFixed(6)})...`);
    
    // Step 4: Buy tokens
    const buyResult = await pumpOps.buyTokens({
      wallet: keypair,
      tokenAddress,
      amountSol: buybackAmount,
      slippage: MAX_SLIPPAGE
    });
    
    if (!buyResult.success) {
      updateBuybackOp({ state: OP_STATES.FAILED, error: buyResult.error });
      throw new Error(`Buyback failed: ${buyResult.error}`);
    }
    
    // Use the tokens received from the buy, not the entire wallet balance!
    const tokensBought = parseInt(buyResult.tokensReceived);
    updateBuybackOp({ 
      state: OP_STATES.TOKENS_BOUGHT, 
      buyTx: buyResult.signature, 
      tokensBought 
    });
    log(`Bought ${tokensBought.toLocaleString()} tokens! TX: ${buyResult.signature}`);
    
    // Step 5: Burn ONLY the purchased tokens (with small buffer for rounding)
    const tokensToBurn = Math.floor(tokensBought * 0.99); // 99% of BOUGHT tokens
    
    if (tokensToBurn <= 0) {
      throw new Error('No tokens available to burn');
    }
    
    log(`Step 4: Burning ${tokensToBurn.toLocaleString()} tokens...`);
    
    const burnResult = await burnTokens(keypair, tokensToBurn, tokenAddress, 'buyback');
    
    if (!burnResult.success) {
      updateBuybackOp({ state: OP_STATES.FAILED, error: burnResult.error });
      throw new Error(`Burn failed: ${burnResult.error}`);
    }
    
    updateBuybackOp({ state: OP_STATES.BURNED, burnTx: burnResult.signature });
    log(`Burn complete! TX: ${burnResult.signature}`);
    
    // Step 6: Record in database
    const marketCap = await getMarketCap();
    const tokenPrice = await getTokenPrice();
    const solPrice = await getSolPriceInUsd();
    
    recordBurn({
      burnType: 'buyback',
      burnAmount: tokensToBurn,
      txSignature: burnResult.signature,
      marketCap,
      solPrice,
      tokenPrice: tokenPrice.priceInUsd,
      solSpent: buybackAmount,
      tokensBought: parseInt(buyResult.tokensReceived)
    });
    
    // Mark operation as complete
    completeBuybackOp();
    
    // Update metrics
    const totalBurned = getTotalBurned();
    const burnsByType = getBurnsByType();
    const initialSupply = parseInt(process.env.INITIAL_SUPPLY) || 1000000000;
    
    saveMetrics({
      totalBurned,
      circulatingSupply: initialSupply - totalBurned,
      milestoneBurned: burnsByType.milestone,
      buybackBurned: burnsByType.buyback,
      marketCap,
      tokenPrice: tokenPrice.priceInUsd
    });
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    log(`=== Cycle Complete in ${duration}s ===`);
    log(`Burned: ${tokensToBurn.toLocaleString()} tokens`);
    log(`SOL spent: ${buybackAmount.toFixed(6)} SOL`);
    log(`Total burned: ${totalBurned.toLocaleString()} tokens`);
    
  } catch (error) {
    log(`Error in buyback cycle: ${error.message}`, 'error');
    console.error(error);
  } finally {
    isProcessing = false;
  }
}

/**
 * Initialize and start the script
 */
async function main() {
  log('Initializing Buyback & Burn Script...');
  
  // Initialize database
  initDatabase();
  log('Database initialized');
  
  // Validate configuration
  const requiredEnvVars = ['TOKEN_ADDRESS', 'WALLET_PRIVATE_KEY'];
  const missing = requiredEnvVars.filter(v => !process.env[v]);
  
  if (missing.length > 0) {
    log(`Missing required environment variables: ${missing.join(', ')}`, 'error');
    process.exit(1);
  }
  
  log(`Token: ${process.env.TOKEN_ADDRESS}`);
  log(`Reward threshold: ${REWARD_THRESHOLD} SOL`);
  log(`Check interval: ${CHECK_INTERVAL} minutes`);
  
  // Check for incomplete operations from previous run
  log('Checking for pending operations...');
  const recovery = await checkPendingOps();
  
  if (recovery.buyback) {
    log(`Found incomplete buyback: ${recovery.buyback.action}`);
    const connection = getConnection();
    const keypair = createKeypair();
    const tokenAddress = process.env.TOKEN_ADDRESS;
    
    const recovered = await handleRecovery(recovery, keypair, tokenAddress);
    if (recovered) {
      log('Recovery completed successfully', 'success');
    } else {
      log('Recovery failed or not needed', 'warn');
    }
  } else {
    log('No pending operations found');
  }
  
  // Run initial cycle
  log('Running initial check...');
  await executeBuybackCycle();
  
  // Schedule recurring checks
  const cronExpression = `*/${CHECK_INTERVAL} * * * *`;
  cron.schedule(cronExpression, () => {
    log('Scheduled check triggered');
    executeBuybackCycle();
  });
  
  log(`Scheduled to run every ${CHECK_INTERVAL} minutes`);
  log('Buyback script running. Press Ctrl+C to stop.');
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  log('Shutting down gracefully...');
  process.exit(0);
});

process.on('uncaughtException', (error) => {
  log(`Uncaught exception: ${error.message}`, 'error');
  console.error(error);
});

// Start the script
main().catch(console.error);