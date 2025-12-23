#!/usr/bin/env node
/**
 * Check and manage pending operations
 * 
 * Usage:
 *   node check-pending.js         # Show pending operations
 *   node check-pending.js clear   # Clear all pending operations
 *   node check-pending.js verify  # Verify pending transactions on-chain
 */

require('dotenv').config();

const {
  loadPendingOps,
  clearAllPendingOps,
  checkPendingOps,
  verifyTransaction
} = require('./src/lib/recovery');

async function main() {
  const command = process.argv[2];
  
  console.log('🔍 Pending Operations Manager\n');
  
  if (command === 'clear') {
    clearAllPendingOps();
    console.log('✅ All pending operations cleared');
    return;
  }
  
  const state = loadPendingOps();
  
  console.log('📋 Current State:');
  console.log(JSON.stringify(state, null, 2));
  
  if (command === 'verify') {
    console.log('\n🔍 Verifying transactions on-chain...\n');
    
    if (state.buyback?.burnTx) {
      console.log(`Buyback burn TX: ${state.buyback.burnTx}`);
      const result = await verifyTransaction(state.buyback.burnTx);
      console.log(`  Verified: ${result.verified ? '✅ YES' : '❌ NO'}`);
      if (result.error) console.log(`  Error: ${result.error}`);
    }
    
    if (state.buyback?.buyTx) {
      console.log(`Buyback buy TX: ${state.buyback.buyTx}`);
      const result = await verifyTransaction(state.buyback.buyTx);
      console.log(`  Verified: ${result.verified ? '✅ YES' : '❌ NO'}`);
    }
    
    if (state.milestone?.burnTx) {
      console.log(`Milestone burn TX: ${state.milestone.burnTx}`);
      const result = await verifyTransaction(state.milestone.burnTx);
      console.log(`  Verified: ${result.verified ? '✅ YES' : '❌ NO'}`);
      if (result.error) console.log(`  Error: ${result.error}`);
    }
    
    console.log('\n📊 Recovery analysis...');
    const recovery = await checkPendingOps();
    console.log(JSON.stringify(recovery, null, 2));
  }
  
  if (!state.buyback && !state.milestone) {
    console.log('\n✅ No pending operations');
  } else {
    console.log('\n⚠️  Pending operations found');
    console.log('   Run with "verify" to check on-chain status');
    console.log('   Run with "clear" to reset (use carefully!)');
  }
}

main().catch(console.error);