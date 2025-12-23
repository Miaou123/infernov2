/**
 * Operation Recovery and Verification for $INFERNO
 * 
 * Prevents duplicate burns and handles crash recovery
 */
const fs = require('fs');
const path = require('path');
const { Connection } = require('@solana/web3.js');
const { getConnection } = require('./solana');
require('dotenv').config();

const STATE_FILE = path.join(process.cwd(), 'data', 'pending-ops.json');

/**
 * Pending operation states
 */
const OP_STATES = {
  STARTED: 'started',
  FEES_COLLECTED: 'fees_collected',
  TOKENS_BOUGHT: 'tokens_bought',
  BURNED: 'burned',
  COMPLETED: 'completed',
  FAILED: 'failed'
};

/**
 * Load pending operations state
 */
function loadPendingOps() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    }
  } catch (error) {
    console.log('Could not load pending ops, starting fresh');
  }
  return { buyback: null, milestone: null };
}

/**
 * Save pending operations state
 */
function savePendingOps(state) {
  try {
    const dir = path.dirname(STATE_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (error) {
    console.error('Could not save pending ops:', error.message);
  }
}

/**
 * Start tracking a buyback operation
 */
function startBuybackOp(solAmount) {
  const state = loadPendingOps();
  state.buyback = {
    state: OP_STATES.STARTED,
    solAmount,
    startedAt: new Date().toISOString(),
    collectTx: null,
    buyTx: null,
    burnTx: null,
    tokensBought: null
  };
  savePendingOps(state);
  return state.buyback;
}

/**
 * Update buyback operation state
 */
function updateBuybackOp(updates) {
  const state = loadPendingOps();
  if (state.buyback) {
    state.buyback = { ...state.buyback, ...updates };
    savePendingOps(state);
  }
  return state.buyback;
}

/**
 * Complete buyback operation
 */
function completeBuybackOp() {
  const state = loadPendingOps();
  state.buyback = null;
  savePendingOps(state);
}

/**
 * Start tracking a milestone operation
 */
function startMilestoneOp(milestoneMarketCap, burnAmount) {
  const state = loadPendingOps();
  state.milestone = {
    state: OP_STATES.STARTED,
    milestoneMarketCap,
    burnAmount,
    startedAt: new Date().toISOString(),
    burnTx: null
  };
  savePendingOps(state);
  return state.milestone;
}

/**
 * Update milestone operation state
 */
function updateMilestoneOp(updates) {
  const state = loadPendingOps();
  if (state.milestone) {
    state.milestone = { ...state.milestone, ...updates };
    savePendingOps(state);
  }
  return state.milestone;
}

/**
 * Complete milestone operation
 */
function completeMilestoneOp() {
  const state = loadPendingOps();
  state.milestone = null;
  savePendingOps(state);
}

/**
 * Verify a transaction exists on-chain
 */
async function verifyTransaction(signature) {
  try {
    const connection = getConnection();
    const tx = await connection.getTransaction(signature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0
    });
    
    if (tx && tx.meta && !tx.meta.err) {
      return {
        verified: true,
        slot: tx.slot,
        blockTime: tx.blockTime
      };
    }
    
    return { verified: false, error: 'Transaction failed or not found' };
  } catch (error) {
    return { verified: false, error: error.message };
  }
}

/**
 * Check for incomplete operations on startup
 * Returns recovery actions needed
 */
async function checkPendingOps() {
  const state = loadPendingOps();
  const recovery = {
    buyback: null,
    milestone: null
  };
  
  // Check pending buyback
  if (state.buyback) {
    console.log('Found pending buyback operation:', state.buyback.state);
    
    if (state.buyback.burnTx) {
      // Burn was attempted - verify it
      const result = await verifyTransaction(state.buyback.burnTx);
      if (result.verified) {
        console.log('✅ Buyback burn verified on-chain, marking complete');
        recovery.buyback = { action: 'mark_complete', tx: state.buyback.burnTx };
      } else {
        console.log('❌ Buyback burn not verified, needs retry');
        recovery.buyback = { 
          action: 'retry_burn', 
          tokensBought: state.buyback.tokensBought 
        };
      }
    } else if (state.buyback.buyTx && state.buyback.tokensBought) {
      // Tokens were bought but not burned
      const result = await verifyTransaction(state.buyback.buyTx);
      if (result.verified) {
        console.log('⚠️ Tokens bought but not burned, needs burn');
        recovery.buyback = { 
          action: 'burn_tokens', 
          tokensBought: state.buyback.tokensBought,
          buyTx: state.buyback.buyTx
        };
      } else {
        console.log('Buy transaction not verified, clearing state');
        recovery.buyback = { action: 'clear' };
      }
    } else if (state.buyback.collectTx) {
      // Fees collected but tokens not bought
      console.log('⚠️ Fees collected but buyback incomplete');
      recovery.buyback = { action: 'clear' }; // SOL is in wallet, will be used next cycle
    } else {
      // Just started, nothing happened
      recovery.buyback = { action: 'clear' };
    }
  }
  
  // Check pending milestone
  if (state.milestone) {
    console.log('Found pending milestone operation:', state.milestone.state);
    
    if (state.milestone.burnTx) {
      const result = await verifyTransaction(state.milestone.burnTx);
      if (result.verified) {
        console.log('✅ Milestone burn verified on-chain, marking complete');
        recovery.milestone = { 
          action: 'mark_complete', 
          tx: state.milestone.burnTx,
          marketCap: state.milestone.milestoneMarketCap
        };
      } else {
        console.log('❌ Milestone burn not verified, needs retry');
        recovery.milestone = { 
          action: 'retry_burn',
          marketCap: state.milestone.milestoneMarketCap,
          burnAmount: state.milestone.burnAmount
        };
      }
    } else {
      // Burn not attempted yet
      recovery.milestone = { action: 'clear' };
    }
  }
  
  return recovery;
}

/**
 * Clear all pending operations (use with caution)
 */
function clearAllPendingOps() {
  savePendingOps({ buyback: null, milestone: null });
  console.log('All pending operations cleared');
}

/**
 * Check if a burn transaction already exists in database
 */
function burnTxExists(db, txSignature) {
  const result = db.prepare('SELECT id FROM burns WHERE tx_signature = ?').get(txSignature);
  return !!result;
}

/**
 * Check if a milestone is already completed in database
 */
function milestoneCompleted(db, marketCap) {
  const result = db.prepare('SELECT completed FROM milestones WHERE market_cap = ?').get(marketCap);
  return result && result.completed === 1;
}

module.exports = {
  OP_STATES,
  loadPendingOps,
  savePendingOps,
  startBuybackOp,
  updateBuybackOp,
  completeBuybackOp,
  startMilestoneOp,
  updateMilestoneOp,
  completeMilestoneOp,
  verifyTransaction,
  checkPendingOps,
  clearAllPendingOps,
  burnTxExists,
  milestoneCompleted
};