#!/usr/bin/env node
/**
 * Milestone Burn Script for $INFERNO Token
 * 
 * This script monitors the market cap and executes burns when milestones are reached.
 * Burns are executed from the reserve wallet.
 * 
 * Includes crash recovery - safe to restart at any time
 */
const cron = require('node-cron');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const { 
  initDatabase, 
  recordBurn, 
  saveMetrics,
  initMilestones, 
  getMilestones, 
  getPendingMilestones, 
  completeMilestone,
  getTotalBurned,
  getBurnsByType,
  getDb
} = require('../lib/database');
const { createKeypair, burnTokens, getTokenBalance } = require('../lib/solana');
const { getMarketCap, getTokenPrice, getSolPriceInUsd } = require('../lib/priceOracle');
const { CONSTANTS, formatMarketCap, formatTokenAmount, getSettings } = require('../lib/config');
const {
  startMilestoneOp,
  updateMilestoneOp,
  completeMilestoneOp,
  checkPendingOps,
  verifyTransaction,
  burnTxExists,
  milestoneCompleted,
  OP_STATES
} = require('../lib/recovery');

// Get settings
const settings = getSettings();
const CHECK_INTERVAL = settings.milestoneInterval;

let isProcessing = false;
let lastCheckedMarketCap = 0;

/**
 * Log with timestamp
 */
function log(message, level = 'info') {
  const timestamp = new Date().toISOString();
  const prefix = level === 'error' ? '❌' : level === 'warn' ? '⚠️' : level === 'success' ? '✅' : '📊';
  console.log(`[${timestamp}] ${prefix} [MILESTONE] ${message}`);
}

/**
 * Execute a milestone burn
 */
async function executeMilestoneBurn(milestone) {
  try {
    // Double-check milestone isn't already completed
    const db = getDb();
    if (milestoneCompleted(db, milestone.market_cap)) {
      log(`Milestone ${formatMarketCap(milestone.market_cap)} already completed, skipping`);
      return null;
    }
    
    log(`Executing burn for ${formatMarketCap(milestone.market_cap)} milestone...`);
    
    // Start tracking this operation
    startMilestoneOp(milestone.market_cap, milestone.burn_amount);
    
    const wallet = createKeypair();
    const tokenAddress = process.env.TOKEN_ADDRESS;
    
    // Check wallet balance for reserve tokens
    const balance = await getTokenBalance(wallet.publicKey.toString(), tokenAddress);
    
    if (balance < milestone.burn_amount) {
      log(`Insufficient balance: ${balance.toLocaleString()} < ${milestone.burn_amount.toLocaleString()}`, 'error');
      updateMilestoneOp({ state: OP_STATES.FAILED, error: 'Insufficient balance' });
      return null;
    }
    
    // Execute burn
    const burnResult = await burnTokens(
      wallet,
      milestone.burn_amount,
      tokenAddress,
      'milestone'
    );
    
    if (!burnResult.success) {
      updateMilestoneOp({ state: OP_STATES.FAILED, error: burnResult.error });
      throw new Error(`Burn failed: ${burnResult.error}`);
    }
    
    // Update state with burn TX
    updateMilestoneOp({ state: OP_STATES.BURNED, burnTx: burnResult.signature });
    
    // Record in database
    const marketCap = await getMarketCap();
    const tokenPrice = await getTokenPrice();
    const solPrice = await getSolPriceInUsd();
    
    recordBurn({
      burnType: 'milestone',
      burnAmount: milestone.burn_amount,
      txSignature: burnResult.signature,
      marketCap,
      solPrice,
      tokenPrice: tokenPrice.priceInUsd,
      milestoneTarget: milestone.market_cap
    });
    
    // Mark milestone as completed
    completeMilestone(milestone.market_cap, burnResult.signature);
    
    // Clear pending operation
    completeMilestoneOp();
    
    log(`🔥 MILESTONE BURN COMPLETE 🔥`, 'success');
    log(`   Milestone: ${formatMarketCap(milestone.market_cap)}`);
    log(`   Burned: ${formatTokenAmount(milestone.burn_amount)} tokens`);
    log(`   TX: ${burnResult.signature}`);
    
    return burnResult;
    
  } catch (error) {
    log(`Error executing milestone burn: ${error.message}`, 'error');
    return null;
  }
}

/**
 * Check milestones and execute pending burns
 */
async function checkMilestones() {
  if (isProcessing) {
    log('Check already in progress, skipping...', 'warn');
    return;
  }
  
  isProcessing = true;
  
  try {
    // Get current market cap
    const currentMarketCap = await getMarketCap();
    
    if (currentMarketCap === lastCheckedMarketCap) {
      log(`Market cap unchanged: ${formatMarketCap(currentMarketCap)}`);
      return;
    }
    
    lastCheckedMarketCap = currentMarketCap;
    log(`Current market cap: ${formatMarketCap(currentMarketCap)}`);
    
    // Get pending milestones
    const pendingMilestones = getPendingMilestones(currentMarketCap);
    
    if (pendingMilestones.length === 0) {
      // Find next milestone
      const milestones = getMilestones();
      const nextMilestone = milestones.find(m => m.completed === 0);
      
      if (nextMilestone) {
        const progress = ((currentMarketCap / nextMilestone.market_cap) * 100).toFixed(1);
        log(`Next milestone: ${formatMarketCap(nextMilestone.market_cap)} (${progress}% progress)`);
      } else {
        log('All milestones completed! 🎉', 'success');
      }
      return;
    }
    
    log(`Found ${pendingMilestones.length} pending milestone(s)!`);
    
    // Execute burns for each pending milestone
    for (const milestone of pendingMilestones) {
      log(`Processing ${formatMarketCap(milestone.market_cap)} milestone...`);
      
      const result = await executeMilestoneBurn(milestone);
      
      if (result) {
        // Wait between burns to avoid rate limiting
        await new Promise(r => setTimeout(r, 5000));
      }
    }
    
    // Update metrics
    const totalBurned = getTotalBurned();
    const burnsByType = getBurnsByType();
    const initialSupply = parseInt(process.env.INITIAL_SUPPLY) || 1000000000;
    const tokenPrice = await getTokenPrice();
    
    saveMetrics({
      totalBurned,
      circulatingSupply: initialSupply - totalBurned,
      milestoneBurned: burnsByType.milestone,
      buybackBurned: burnsByType.buyback,
      marketCap: currentMarketCap,
      tokenPrice: tokenPrice.priceInUsd
    });
    
  } catch (error) {
    log(`Error checking milestones: ${error.message}`, 'error');
    console.error(error);
  } finally {
    isProcessing = false;
  }
}

/**
 * Display milestone status
 */
function displayMilestoneStatus() {
  const milestones = getMilestones();
  
  log('=== MILESTONE STATUS ===');
  
  milestones.forEach(m => {
    const status = m.completed ? '✅ COMPLETED' : '⏳ PENDING';
    log(`  ${formatMarketCap(m.market_cap)}: ${formatTokenAmount(m.burn_amount)} tokens - ${status}`);
  });
  
  const completed = milestones.filter(m => m.completed).length;
  log(`Progress: ${completed}/${milestones.length} milestones completed`);
}

/**
 * Handle recovery of incomplete milestone operations
 */
async function handleMilestoneRecovery(recovery) {
  if (!recovery.milestone) return false;
  
  const { action, tx, marketCap, burnAmount } = recovery.milestone;
  const db = getDb();
  
  if (action === 'mark_complete') {
    log('Completing previously verified milestone burn...');
    
    // Check if not already in DB
    if (!burnTxExists(db, tx)) {
      const currentMarketCap = await getMarketCap();
      const tokenPrice = await getTokenPrice();
      const solPrice = await getSolPriceInUsd();
      
      recordBurn({
        burnType: 'milestone',
        burnAmount: burnAmount || 0,
        txSignature: tx,
        marketCap: currentMarketCap,
        solPrice,
        tokenPrice: tokenPrice.priceInUsd,
        milestoneTarget: marketCap
      });
    }
    
    // Mark milestone complete if not already
    if (!milestoneCompleted(db, marketCap)) {
      completeMilestone(marketCap, tx);
    }
    
    completeMilestoneOp();
    log(`Recovered milestone ${formatMarketCap(marketCap)}`);
    return true;
  }
  
  if (action === 'retry_burn') {
    log(`Retrying milestone burn for ${formatMarketCap(marketCap)}...`);
    const milestone = { market_cap: marketCap, burn_amount: burnAmount };
    await executeMilestoneBurn(milestone);
    return true;
  }
  
  if (action === 'clear') {
    completeMilestoneOp();
    log('Cleared incomplete milestone state');
    return true;
  }
  
  return false;
}

/**
 * Initialize and start the script
 */
async function main() {
  log('Initializing Milestone Monitoring Script...');
  
  // Initialize database
  initDatabase();
  log('Database initialized');
  
  // Initialize milestones from config
  initMilestones(CONSTANTS.BURN_SCHEDULE);
  log(`Loaded ${CONSTANTS.BURN_SCHEDULE.length} milestones`);
  
  // Validate configuration
  const requiredEnvVars = ['TOKEN_ADDRESS', 'WALLET_PRIVATE_KEY'];
  const missing = requiredEnvVars.filter(v => !process.env[v]);
  
  if (missing.length > 0) {
    log(`Missing required environment variables: ${missing.join(', ')}`, 'error');
    process.exit(1);
  }
  
  log(`Token: ${process.env.TOKEN_ADDRESS}`);
  log(`Check interval: ${CHECK_INTERVAL} minutes`);
  
  // Check for incomplete operations from previous run
  log('Checking for pending operations...');
  const recovery = await checkPendingOps();
  
  if (recovery.milestone) {
    log(`Found incomplete milestone: ${recovery.milestone.action}`);
    const recovered = await handleMilestoneRecovery(recovery);
    if (recovered) {
      log('Recovery completed successfully', 'success');
    }
  } else {
    log('No pending milestone operations found');
  }
  
  // Display initial status
  displayMilestoneStatus();
  
  // Run initial check
  log('Running initial check...');
  await checkMilestones();
  
  // Schedule recurring checks
  const cronExpression = `*/${CHECK_INTERVAL} * * * *`;
  cron.schedule(cronExpression, () => {
    log('Scheduled check triggered');
    checkMilestones();
  });
  
  log(`Scheduled to run every ${CHECK_INTERVAL} minutes`);
  log('Milestone script running. Press Ctrl+C to stop.');
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