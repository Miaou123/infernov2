/**
 * Solana Utilities for $INFERNO Token
 * Handles wallet, connection, and token operations
 */
const { 
  Connection, 
  Keypair, 
  PublicKey, 
  Transaction,
  sendAndConfirmTransaction,
  SystemProgram
} = require('@solana/web3.js');
const { 
  getAssociatedTokenAddress, 
  createBurnInstruction,
  TOKEN_PROGRAM_ID,
  getAccount,
  getMint
} = require('@solana/spl-token');
const bs58 = require('bs58');
require('dotenv').config();

let connection = null;

/**
 * Get or create Solana connection
 */
function getConnection() {
  if (!connection) {
    const rpcUrl = process.env.HELIUS_RPC_URL || process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
    connection = new Connection(rpcUrl, 'confirmed');
  }
  return connection;
}

/**
 * Create keypair from private key
 * Single wallet handles everything: buybacks, burns, fee collection
 */
function createKeypair() {
  const privateKey = process.env.WALLET_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error('WALLET_PRIVATE_KEY not configured in .env');
  }
  
  try {
    const decoded = bs58.decode(privateKey);
    return Keypair.fromSecretKey(decoded);
  } catch (e) {
    // Try as JSON array format
    try {
      const secretKey = Uint8Array.from(JSON.parse(privateKey));
      return Keypair.fromSecretKey(secretKey);
    } catch (e2) {
      throw new Error('Invalid WALLET_PRIVATE_KEY format. Use base58 or JSON array.');
    }
  }
}

/**
 * Get wallet public key
 */
function getWalletAddress() {
  return createKeypair().publicKey.toString();
}

/**
 * Get SOL balance for a wallet
 */
async function getSolBalance(walletAddress) {
  try {
    const conn = getConnection();
    const pubkey = new PublicKey(walletAddress);
    const balance = await conn.getBalance(pubkey);
    return balance / 1_000_000_000; // Convert lamports to SOL
  } catch (error) {
    console.error('Error getting SOL balance:', error);
    return 0;
  }
}

/**
 * Get token balance for a wallet
 */
async function getTokenBalance(walletAddress, tokenAddress) {
  try {
    const conn = getConnection();
    const wallet = new PublicKey(walletAddress);
    const mint = new PublicKey(tokenAddress);
    
    const ata = await getAssociatedTokenAddress(mint, wallet);
    
    try {
      const account = await getAccount(conn, ata);
      return Number(account.amount);
    } catch (e) {
      // Account doesn't exist
      return 0;
    }
  } catch (error) {
    console.error('Error getting token balance:', error);
    return 0;
  }
}

/**
 * Burn tokens using SPL Token burn instruction
 * This properly reduces the token supply on-chain
 */
async function burnTokens(keypair, amount, tokenAddress, burnType = 'milestone') {
  try {
    const conn = getConnection();
    const mint = new PublicKey(tokenAddress);
    
    // Get the token account to burn from
    const tokenAccount = await getAssociatedTokenAddress(mint, keypair.publicKey);
    
    // Verify the account exists and has sufficient balance
    const accountInfo = await getAccount(conn, tokenAccount);
    if (Number(accountInfo.amount) < amount) {
      throw new Error(`Insufficient token balance: ${accountInfo.amount} < ${amount}`);
    }
    
    // Get mint info for decimals (needed for burnChecked if we use it)
    const mintInfo = await getMint(conn, mint);
    
    // Create burn instruction - this permanently destroys the tokens
    const burnIx = createBurnInstruction(
      tokenAccount,      // Token account to burn from
      mint,              // Token mint
      keypair.publicKey, // Owner of the token account
      amount,            // Amount to burn (in smallest units)
      [],                // No multisig signers
      TOKEN_PROGRAM_ID
    );
    
    // Create transaction
    const tx = new Transaction().add(burnIx);
    
    // Add memo for tracking (optional but helpful for explorers)
    const memoProgram = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
    const memoIx = {
      keys: [],
      programId: memoProgram,
      data: Buffer.from(`INFERNO ${burnType.toUpperCase()} BURN: ${amount} tokens`)
    };
    tx.add(memoIx);
    
    // Send and confirm transaction
    const signature = await sendAndConfirmTransaction(
      conn,
      tx,
      [keypair],
      { commitment: 'confirmed' }
    );
    
    console.log(`🔥 Burned ${amount} tokens using SPL Token burn - TX: ${signature}`);
    
    return {
      success: true,
      signature,
      amount,
      burnType,
      method: 'spl-token-burn'
    };
  } catch (error) {
    console.error('Error burning tokens:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Transfer SOL
 */
async function transferSol(senderKeypair, destinationAddress, amount) {
  try {
    const conn = getConnection();
    const destination = new PublicKey(destinationAddress);
    const lamports = amount * 1_000_000_000;
    
    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: senderKeypair.publicKey,
        toPubkey: destination,
        lamports
      })
    );
    
    const signature = await sendAndConfirmTransaction(
      conn,
      tx,
      [senderKeypair],
      { commitment: 'confirmed' }
    );
    
    return { success: true, signature, amount };
  } catch (error) {
    console.error('Error transferring SOL:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send transaction with retry logic
 */
async function sendWithRetry(connection, transaction, signers, options = {}, maxRetries = 3) {
  let lastError;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      const signature = await sendAndConfirmTransaction(
        connection,
        transaction,
        signers,
        { commitment: 'confirmed', ...options }
      );
      return signature;
    } catch (error) {
      lastError = error;
      console.log(`Transaction attempt ${i + 1} failed, retrying...`);
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
  
  throw lastError;
}

module.exports = {
  getConnection,
  createKeypair,
  getWalletAddress,
  getSolBalance,
  getTokenBalance,
  burnTokens,
  transferSol,
  sendWithRetry
};