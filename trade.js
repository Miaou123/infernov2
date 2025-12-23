#!/usr/bin/env node
/**
 * Simple trade script for inferno-next
 * Usage:
 *   node trade.js buy 0.1       # Buy with 0.1 SOL
 *   node trade.js sell 50%      # Sell 50% of tokens
 *   node trade.js sell 1000000  # Sell specific amount
 *   node trade.js balance       # Check balances
 */

const { getConnection, createKeypair, getTokenBalance, getSolBalance } = require('./src/lib/solana');
const { createPumpFunOperations } = require('./src/lib/pumpfun');
require('dotenv').config();

async function main() {
  const args = process.argv.slice(2);
  const command = args[0]?.toLowerCase();
  
  const connection = getConnection();
  const wallet = createKeypair();
  const pumpOps = createPumpFunOperations(connection);
  const tokenAddress = process.env.TOKEN_ADDRESS;
  
  console.log('🎯 Inferno Trader');
  console.log(`📍 Wallet: ${wallet.publicKey.toString()}`);
  console.log(`🪙 Token: ${tokenAddress}`);
  console.log('');
  
  switch (command) {
    case 'balance':
    case 'bal':
      const sol = await getSolBalance(wallet.publicKey.toString());
      const tokens = await getTokenBalance(wallet.publicKey.toString(), tokenAddress);
      console.log(`💰 SOL: ${sol.toFixed(6)}`);
      console.log(`🔥 Tokens: ${tokens.toLocaleString()}`);
      
      // Show creator fees too
      try {
        const fees = await pumpOps.getCreatorFeeBalance(wallet.publicKey.toString());
        console.log(`💎 Creator fees: ${fees.toFixed(9)} SOL`);
      } catch (e) {}
      break;
      
    case 'buy':
      const buyAmount = parseFloat(args[1]);
      if (!buyAmount || buyAmount <= 0) {
        console.log('Usage: node trade.js buy 0.1');
        return;
      }
      console.log(`🛒 Buying with ${buyAmount} SOL...`);
      const buyResult = await pumpOps.buyTokens({
        wallet,
        tokenAddress,
        amountSol: buyAmount,
        slippage: 15
      });
      if (buyResult.success) {
        console.log(`✅ Success! TX: ${buyResult.signature}`);
        console.log(`🔥 Tokens received: ${buyResult.tokensReceived}`);
      } else {
        console.log(`❌ Failed: ${buyResult.error}`);
      }
      break;
      
    case 'sell':
      let sellAmount = args[1];
      if (!sellAmount) {
        console.log('Usage: node trade.js sell 50%');
        console.log('       node trade.js sell 1000000');
        return;
      }
      
      const currentBalance = await getTokenBalance(wallet.publicKey.toString(), tokenAddress);
      let tokensToSell;
      
      if (sellAmount.endsWith('%')) {
        const percent = parseFloat(sellAmount) / 100;
        tokensToSell = Math.floor(currentBalance * percent);
        console.log(`📊 Selling ${sellAmount} of ${currentBalance.toLocaleString()} tokens`);
      } else {
        tokensToSell = parseInt(sellAmount);
      }
      
      if (tokensToSell <= 0 || tokensToSell > currentBalance) {
        console.log(`❌ Invalid amount. Balance: ${currentBalance.toLocaleString()}`);
        return;
      }
      
      console.log(`💸 Selling ${tokensToSell.toLocaleString()} tokens...`);
      const sellResult = await pumpOps.sellTokens({
        wallet,
        tokenAddress,
        tokenAmount: tokensToSell,
        slippage: 50  // 50% slippage for low liquidity
      });
      if (sellResult.success) {
        console.log(`✅ Success! TX: ${sellResult.signature}`);
        console.log(`💰 SOL received: ${sellResult.solReceived}`);
      } else {
        console.log(`❌ Failed: ${sellResult.error}`);
      }
      break;
      
    case 'fees':
      const fees = await pumpOps.getCreatorFeeBalance(wallet.publicKey.toString());
      console.log(`💎 Creator fees available: ${fees.toFixed(9)} SOL`);
      break;
      
    default:
      console.log('Commands:');
      console.log('  node trade.js balance     - Check balances');
      console.log('  node trade.js buy 0.1     - Buy with 0.1 SOL');
      console.log('  node trade.js sell 50%    - Sell 50% of tokens');
      console.log('  node trade.js sell 100000 - Sell specific amount');
      console.log('  node trade.js fees        - Check creator fees');
  }
}

main().catch(console.error);