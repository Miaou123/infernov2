/**
 * PumpFun Operations for $INFERNO Token
 * 
 * Pre-graduation: Uses PumpFun bonding curve
 * Post-graduation: Uses Jupiter Ultra API for swaps
 * Fee collection: Uses PumpFun SDK for both bonding curve and AMM fees
 */
const { PublicKey, Transaction, VersionedTransaction } = require('@solana/web3.js');
const BN = require('bn.js');
const { getConnection, sendWithRetry } = require('./solana');
require('dotenv').config();

// PumpFun SDK for bonding curve operations
const { 
  OnlinePumpSdk,
  PUMP_SDK,
  PUMP_PROGRAM_ID,
  getBuyTokenAmountFromSolAmount,
  getSellSolAmountFromTokenAmount
} = require('@pump-fun/pump-sdk');

// PumpSwap SDK - only for fee collection
const { 
  OnlinePumpAmmSdk,
  PUMP_AMM_PROGRAM_ID
} = require('@pump-fun/pump-swap-sdk');

// Jupiter Ultra API
const JUPITER_ULTRA_API = 'https://api.jup.ag/ultra/v1';
const SOL_MINT = 'So11111111111111111111111111111111111111112';

/**
 * Create PumpFun operations instance
 */
function createPumpFunOperations(connection) {
  const onlineSdk = new OnlinePumpSdk(connection);
  const offlineSdk = PUMP_SDK;
  const onlineAmmSdk = new OnlinePumpAmmSdk(connection);
  
  return {
    /**
     * Check if token has graduated from bonding curve
     */
    async isTokenGraduated(tokenAddress) {
      try {
        const mint = new PublicKey(tokenAddress);
        const bondingCurve = await onlineSdk.fetchBondingCurve(mint);
        return !bondingCurve || bondingCurve.complete;
      } catch (error) {
        console.log('Error checking graduation status:', error.message);
        return true;
      }
    },
    
    /**
     * Get token price from bonding curve
     */
    async getTokenPrice(tokenAddress) {
      try {
        const mint = new PublicKey(tokenAddress);
        const bondingCurve = await onlineSdk.fetchBondingCurve(mint);
        
        if (bondingCurve && !bondingCurve.complete) {
          const global = await onlineSdk.fetchGlobal();
          const oneSol = new BN(1_000_000_000);
          
          const tokenAmount = getBuyTokenAmountFromSolAmount({
            global,
            feeConfig: null,
            mintSupply: bondingCurve.realTokenReserves,
            bondingCurve,
            amount: oneSol
          });
          
          const priceInSol = 1 / (tokenAmount.toNumber() / 1e6);
          const totalSupply = parseInt(process.env.INITIAL_SUPPLY) || 1000000000;
          
          return {
            priceInSol,
            marketCap: priceInSol * totalSupply,
            source: 'bonding_curve',
            isGraduated: false
          };
        }
        
        return null;
      } catch (error) {
        console.error('Error getting token price:', error.message);
        return null;
      }
    },
    
    /**
     * Get creator fee balance (bonding curve + AMM)
     */
    async getCreatorFeeBalance(creatorAddress) {
      try {
        const creator = new PublicKey(creatorAddress);
        let bondingCurveBalance = 0;
        let ammBalance = 0;
        
        try {
          const bcBalance = await onlineSdk.getCreatorVaultBalanceBothPrograms(creator);
          bondingCurveBalance = bcBalance.toNumber() / 1e9;
          console.log(`Bonding curve creator balance: ${bondingCurveBalance.toFixed(9)} SOL`);
        } catch (error) {
          console.log('Could not get bonding curve creator balance:', error.message);
        }
        
        try {
          const ammBal = await onlineAmmSdk.getCoinCreatorVaultBalance(creator);
          ammBalance = ammBal.toNumber() / 1e9;
          console.log(`AMM creator balance: ${ammBalance.toFixed(9)} SOL`);
        } catch (error) {
          console.log('Could not get AMM creator balance:', error.message);
        }
        
        const totalBalance = bondingCurveBalance + ammBalance;
        console.log(`Total creator fee balance: ${totalBalance.toFixed(9)} SOL`);
        
        return totalBalance;
      } catch (error) {
        console.error('Error getting creator fee balance:', error.message);
        return 0;
      }
    },
    
    /**
     * Collect creator fees (bonding curve + AMM)
     */
    async collectCreatorFees(wallet) {
      try {
        const creator = wallet.publicKey;
        const instructions = [];
        
        try {
          const bondingInstructions = await onlineSdk.collectCoinCreatorFeeInstructions(creator);
          if (bondingInstructions?.length > 0) {
            instructions.push(...bondingInstructions);
            console.log(`Added ${bondingInstructions.length} bonding curve fee collection instructions`);
          }
        } catch (error) {
          console.log('Could not get bonding curve fee instructions:', error.message);
        }
        
        try {
          const ammState = await onlineAmmSdk.collectCoinCreatorFeeSolanaState(creator);
          if (ammState?.instructions?.length > 0) {
            instructions.push(...ammState.instructions);
            console.log(`Added ${ammState.instructions.length} AMM fee collection instructions`);
          }
        } catch (error) {
          console.log('Could not get AMM fee instructions:', error.message);
        }
        
        if (instructions.length === 0) {
          console.log('No fee collection instructions generated');
          return { success: false, error: 'No fees to collect' };
        }
        
        console.log(`Total fee collection instructions: ${instructions.length}`);
        
        const tx = new Transaction();
        instructions.forEach(ix => tx.add(ix));
        
        const { blockhash } = await connection.getLatestBlockhash();
        tx.recentBlockhash = blockhash;
        tx.feePayer = wallet.publicKey;
        
        const signature = await sendWithRetry(connection, tx, [wallet], {}, 3);
        console.log(`Creator fees collected! Signature: ${signature}`);
        
        return { success: true, signature };
      } catch (error) {
        console.error('Error collecting creator fees:', error);
        return { success: false, error: error.message };
      }
    },
    
    /**
     * Buy tokens - routes to bonding curve or Jupiter
     */
    async buyTokens({ wallet, tokenAddress, amountSol, slippage = 10 }) {
      try {
        const isGraduated = await this.isTokenGraduated(tokenAddress);
        
        if (isGraduated) {
          return await this.buyWithJupiter({ wallet, tokenAddress, amountSol });
        }
        
        return await this.buyFromBondingCurve({ wallet, tokenAddress, amountSol, slippage });
      } catch (error) {
        console.error('Error buying tokens:', error);
        return { success: false, error: error.message };
      }
    },
    
    /**
     * Buy from bonding curve (pre-graduation)
     */
    async buyFromBondingCurve({ wallet, tokenAddress, amountSol, slippage = 10 }) {
      try {
        const mint = new PublicKey(tokenAddress);
        const global = await onlineSdk.fetchGlobal();
        const { bondingCurveAccountInfo, bondingCurve, associatedUserAccountInfo } = 
          await onlineSdk.fetchBuyState(mint, wallet.publicKey);
        
        const solLamports = new BN(amountSol * 1e9);
        
        const tokenAmount = getBuyTokenAmountFromSolAmount({
          global,
          feeConfig: null,
          mintSupply: bondingCurve.realTokenReserves,
          bondingCurve,
          amount: solLamports
        });
        
        console.log(`💰 Expected tokens: ${tokenAmount.toString()}`);
        
        const instructions = await offlineSdk.buyInstructions({
          global,
          bondingCurveAccountInfo,
          bondingCurve,
          associatedUserAccountInfo,
          mint,
          user: wallet.publicKey,
          solAmount: solLamports,
          amount: tokenAmount,
          slippage: slippage * 100
        });
        
        const tx = new Transaction();
        instructions.forEach(ix => tx.add(ix));
        
        const { blockhash } = await connection.getLatestBlockhash();
        tx.recentBlockhash = blockhash;
        tx.feePayer = wallet.publicKey;
        
        const signature = await sendWithRetry(connection, tx, [wallet], {}, 3);
        
        return {
          success: true,
          signature,
          tokensReceived: tokenAmount.toString(),
          solSpent: amountSol,
          source: 'bonding_curve'
        };
      } catch (error) {
        console.error('Error buying from bonding curve:', error);
        return { success: false, error: error.message };
      }
    },
    
    /**
     * Buy with Jupiter Ultra API (post-graduation, mainnet only)
     */
    async buyWithJupiter({ wallet, tokenAddress, amountSol }) {
      try {
        const amountLamports = Math.floor(amountSol * 1e9);
        
        console.log(`🚀 Using Jupiter Ultra for swap...`);
        console.log(`   Amount: ${amountSol} SOL`);
        
        const params = new URLSearchParams({
          inputMint: SOL_MINT,
          outputMint: tokenAddress,
          amount: amountLamports.toString(),
          taker: wallet.publicKey.toString()
        });
        
        const orderResponse = await fetch(`${JUPITER_ULTRA_API}/order?${params}`);
        const order = await orderResponse.json();
        
        if (order.error || order.errorMessage) {
          throw new Error(order.error || order.errorMessage);
        }
        
        if (!order.transaction) {
          throw new Error(`No transaction: ${order.errorMessage || 'Unknown error'}`);
        }
        
        console.log(`   Router: ${order.router}`);
        console.log(`   Expected: ${order.outAmount} tokens`);
        console.log(`   Price impact: ${((order.priceImpact || 0) * 100).toFixed(2)}%`);
        
        const transactionBuffer = Buffer.from(order.transaction, 'base64');
        const transaction = VersionedTransaction.deserialize(transactionBuffer);
        transaction.sign([wallet]);
        
        const signedTransaction = Buffer.from(transaction.serialize()).toString('base64');
        
        const executeResponse = await fetch(`${JUPITER_ULTRA_API}/execute`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            signedTransaction,
            requestId: order.requestId
          })
        });
        
        const result = await executeResponse.json();
        
        if (result.status === 'Success') {
          console.log(`✅ Jupiter swap successful! TX: ${result.signature}`);
          return {
            success: true,
            signature: result.signature,
            tokensReceived: result.outputAmountResult || order.outAmount,
            solSpent: amountSol,
            source: 'jupiter_ultra'
          };
        } else {
          throw new Error(result.error || 'Swap execution failed');
        }
      } catch (error) {
        console.error('Error with Jupiter swap:', error.message);
        return { success: false, error: error.message };
      }
    },
    
    /**
     * Sell tokens - routes to bonding curve or Jupiter
     */
    async sellTokens({ wallet, tokenAddress, tokenAmount, slippage = 10 }) {
      try {
        const isGraduated = await this.isTokenGraduated(tokenAddress);
        
        if (isGraduated) {
          return await this.sellWithJupiter({ wallet, tokenAddress, tokenAmount });
        }
        
        return await this.sellToBondingCurve({ wallet, tokenAddress, tokenAmount, slippage });
      } catch (error) {
        console.error('Error selling tokens:', error);
        return { success: false, error: error.message };
      }
    },
    
    /**
     * Sell to bonding curve (pre-graduation)
     */
    async sellToBondingCurve({ wallet, tokenAddress, tokenAmount, slippage = 10 }) {
      try {
        const mint = new PublicKey(tokenAddress);
        const global = await onlineSdk.fetchGlobal();
        const { bondingCurveAccountInfo, bondingCurve, associatedUserAccountInfo } = 
          await onlineSdk.fetchSellState(mint, wallet.publicKey);
        
        const tokenAmountBN = new BN(tokenAmount);
        
        const solAmount = getSellSolAmountFromTokenAmount({
          global,
          feeConfig: null,
          mintSupply: bondingCurve.realTokenReserves,
          bondingCurve,
          amount: tokenAmountBN
        });
        
        console.log(`💰 Expected SOL: ${(solAmount.toNumber() / 1e9).toFixed(6)}`);
        
        const instructions = await offlineSdk.sellInstructions({
          global,
          bondingCurveAccountInfo,
          bondingCurve,
          associatedUserAccountInfo,
          mint,
          user: wallet.publicKey,
          solAmount: new BN(1),
          amount: tokenAmountBN,
          slippage: 0
        });
        
        const tx = new Transaction();
        instructions.forEach(ix => tx.add(ix));
        
        const { blockhash } = await connection.getLatestBlockhash();
        tx.recentBlockhash = blockhash;
        tx.feePayer = wallet.publicKey;
        
        const signature = await sendWithRetry(connection, tx, [wallet], {}, 3);
        
        return {
          success: true,
          signature,
          solReceived: solAmount.toNumber() / 1e9,
          source: 'bonding_curve'
        };
      } catch (error) {
        console.error('Error selling to bonding curve:', error);
        return { success: false, error: error.message };
      }
    },
    
    /**
     * Sell with Jupiter Ultra API (post-graduation, mainnet only)
     */
    async sellWithJupiter({ wallet, tokenAddress, tokenAmount }) {
      try {
        const amountRaw = Math.floor(tokenAmount);
        
        console.log(`🚀 Selling via Jupiter...`);
        
        const params = new URLSearchParams({
          inputMint: tokenAddress,
          outputMint: SOL_MINT,
          amount: amountRaw.toString(),
          taker: wallet.publicKey.toString()
        });
        
        const orderResponse = await fetch(`${JUPITER_ULTRA_API}/order?${params}`);
        const order = await orderResponse.json();
        
        if (order.error || order.errorMessage) {
          throw new Error(order.error || order.errorMessage);
        }
        
        if (!order.transaction) {
          throw new Error(`No transaction: ${order.errorMessage || 'Unknown error'}`);
        }
        
        console.log(`   Expected SOL: ${(parseInt(order.outAmount) / 1e9).toFixed(6)}`);
        
        const transactionBuffer = Buffer.from(order.transaction, 'base64');
        const transaction = VersionedTransaction.deserialize(transactionBuffer);
        transaction.sign([wallet]);
        
        const signedTransaction = Buffer.from(transaction.serialize()).toString('base64');
        
        const executeResponse = await fetch(`${JUPITER_ULTRA_API}/execute`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            signedTransaction,
            requestId: order.requestId
          })
        });
        
        const result = await executeResponse.json();
        
        if (result.status === 'Success') {
          console.log(`✅ Sell successful! TX: ${result.signature}`);
          return {
            success: true,
            signature: result.signature,
            solReceived: parseInt(result.outputAmountResult) / 1e9,
            source: 'jupiter_ultra'
          };
        } else {
          throw new Error(result.error || 'Sell failed');
        }
      } catch (error) {
        console.error('Error selling via Jupiter:', error.message);
        return { success: false, error: error.message };
      }
    }
  };
}

module.exports = { 
  createPumpFunOperations,
  PUMP_PROGRAM_ID,
  PUMP_AMM_PROGRAM_ID
};