#!/usr/bin/env node
/**
 * Twitter Bot for $INFERNO Burn Notifications
 * Clean Stats Template with GIF Support
 */
const { TwitterApi } = require('twitter-api-v2');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const { initDatabase, getDb } = require('../lib/database');

// Milestone configuration - import from your config or define here
const MILESTONES = [
  10000, 25000, 50000, 75000, 100000, 150000, 200000, 250000,
  500000, 750000, 1000000, 2500000, 5000000, 10000000, 25000000,
  50000000, 75000000, 100000000
];

class InfernoBurnBot {
  constructor() {
    this.checkEnvVars();
    
    const isTestMode = process.env.TEST_MODE === 'true';
    
    if (!isTestMode) {
      this.twitter = new TwitterApi({
        appKey: process.env.TWITTER_API_KEY,
        appSecret: process.env.TWITTER_API_SECRET,
        accessToken: process.env.TWITTER_ACCESS_TOKEN,
        accessSecret: process.env.TWITTER_ACCESS_SECRET,
      });
      
      console.log('🔧 Twitter API initialized');
    }
    
    this.tweetCount = 0;
    this.isTestMode = isTestMode;
    
    // GIF paths
    this.gifs = {
      milestone: path.join(__dirname, '../../assets/gifs/milestone.gif'),
      buyback: path.join(__dirname, '../../assets/gifs/buyback.gif')
    };
    
    // Initialize database
    initDatabase();
    this.ensureTweetColumn();
    
    console.log(`🔥 Inferno Burn Bot initialized - ${isTestMode ? 'TEST MODE' : 'LIVE MODE'}`);
    
    // Check for GIFs
    this.checkGifs();
  }

  checkGifs() {
    console.log('\n📁 Checking for GIF files...');
    
    Object.entries(this.gifs).forEach(([type, gifPath]) => {
      if (fs.existsSync(gifPath)) {
        const stats = fs.statSync(gifPath);
        const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
        console.log(`  ✅ ${type}.gif found (${sizeMB} MB)`);
      } else {
        console.log(`  ⚠️ ${type}.gif NOT FOUND at ${gifPath}`);
      }
    });
    console.log('');
  }

  ensureTweetColumn() {
    const db = getDb();
    
    try {
      const tableInfo = db.prepare("PRAGMA table_info(burns)").all();
      const hasTweetColumn = tableInfo.some(col => col.name === 'tweet_posted');
      
      if (!hasTweetColumn) {
        console.log('📊 Adding tweet tracking columns...');
        db.exec('ALTER TABLE burns ADD COLUMN tweet_posted INTEGER DEFAULT 0');
        db.exec('ALTER TABLE burns ADD COLUMN tweeted_at DATETIME');
        console.log('✅ Tweet tracking columns added');
      }
    } catch (error) {
      console.error('⚠️ Error with tweet columns:', error.message);
    }
  }

  checkEnvVars() {
    const isTestMode = process.env.TEST_MODE === 'true';
    
    if (!isTestMode) {
      const required = [
        'TWITTER_API_KEY',
        'TWITTER_API_SECRET',
        'TWITTER_ACCESS_TOKEN',
        'TWITTER_ACCESS_SECRET'
      ];
      
      const missing = required.filter(v => !process.env[v]);
      
      if (missing.length > 0) {
        console.error('❌ Missing:', missing.join(', '));
        throw new Error('Missing Twitter credentials');
      }
    }
    
    console.log('✅ Environment variables OK');
  }

  // ============================================
  // STATS HELPERS
  // ============================================

  /**
   * Get total burned amount from database
   */
  getTotalBurned() {
    const db = getDb();
    const result = db.prepare('SELECT SUM(burn_amount) as total FROM burns').get();
    return result?.total || 0;
  }

  /**
   * Get total buyback count
   */
  getBuybackCount() {
    const db = getDb();
    const result = db.prepare("SELECT COUNT(*) as count FROM burns WHERE burn_type = 'buyback'").get();
    return result?.count || 0;
  }

  /**
   * Get next milestone after current market cap
   */
  getNextMilestone(currentMilestone) {
    const currentIndex = MILESTONES.indexOf(currentMilestone);
    if (currentIndex >= 0 && currentIndex < MILESTONES.length - 1) {
      return MILESTONES[currentIndex + 1];
    }
    return null;
  }

  /**
   * Format market cap with K/M/B suffix
   */
  formatMarketCap(num) {
    if (num >= 1000000000) return '$' + (num / 1000000000).toFixed(1) + 'B';
    if (num >= 1000000) return '$' + (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return '$' + (num / 1000).toFixed(0) + 'K';
    return '$' + num.toString();
  }

  /**
   * Format token amount with M/K suffix
   */
  formatTokenAmount(num) {
    // Convert from smallest units to display units
    const displayNum = num / 1e6;
    
    if (displayNum >= 1000000) return (displayNum / 1000000).toFixed(1) + 'M';
    if (displayNum >= 1000) return (displayNum / 1000).toFixed(1) + 'K';
    return displayNum.toLocaleString();
  }

  // ============================================
  // TWEET GENERATION - CLEAN STATS TEMPLATE
  // ============================================

  /**
   * Generate milestone tweet - Clean Stats format
   */
  generateMilestoneTweet(burn) {
    const milestoneAmount = burn.milestone_target || burn.market_cap_at_burn || 0;
    const tokensBurned = Math.round(burn.burn_amount / 1e6); // Convert from smallest units
    const txLink = `solscan.io/tx/${burn.tx_signature}`;
    
    // Get total burned percentage
    const initialSupply = parseInt(process.env.INITIAL_SUPPLY) || 1000000000;
    const totalBurned = this.getTotalBurned();
    const totalBurnedPercent = ((totalBurned / 1e6 / initialSupply) * 100).toFixed(2);
    
    // Get next milestone
    const nextMilestone = this.getNextMilestone(milestoneAmount);
    const nextMilestoneText = nextMilestone 
      ? `Next milestone: ${this.formatMarketCap(nextMilestone)}`
      : 'Final milestone reached! 🏆';

    return `📍 MILESTONE: ${this.formatMarketCap(milestoneAmount)} ✓

Burned: ${tokensBurned.toLocaleString()} $INFERNO
${nextMilestoneText}

Total burned to date: ${totalBurnedPercent}%

➡️ ${txLink}`;
  }

  /**
   * Generate buyback tweet - Clean Stats format
   */
  generateBuybackTweet(burn) {
    const solSpent = parseFloat(burn.sol_spent || 0);
    const tokensBurned = Math.round(burn.burn_amount / 1e6); // Convert from smallest units
    const solPrice = parseFloat(burn.sol_price_at_burn || 0);
    const usdValue = Math.round(solSpent * solPrice);
    const txLink = `solscan.io/tx/${burn.tx_signature}`;
    
    // Get buyback count
    const buybackCount = this.getBuybackCount();
    
    // Get total burned
    const totalBurned = this.getTotalBurned();
    const totalBurnedFormatted = this.formatTokenAmount(totalBurned);

    return `🔄 BUYBACK #${buybackCount}

In: ${solSpent.toFixed(3)} SOL${usdValue > 0 ? ` ($${usdValue})` : ''}
Out: ${tokensBurned.toLocaleString()} $INFERNO 🔥

Total burned to date: ${totalBurnedFormatted} tokens

➡️ ${txLink}`;
  }

  /**
   * Generate tweet based on burn type
   */
  generateTweet(burn) {
    if (burn.burn_type === 'milestone') {
      return this.generateMilestoneTweet(burn);
    } else {
      return this.generateBuybackTweet(burn);
    }
  }

  // ============================================
  // MEDIA UPLOAD
  // ============================================

  /**
   * Upload GIF to Twitter
   */
  async uploadGif(burnType) {
    const gifPath = this.gifs[burnType];
    
    if (!gifPath || !fs.existsSync(gifPath)) {
      console.log(`⚠️ No GIF found for ${burnType}`);
      return null;
    }

    try {
      console.log(`📤 Uploading ${burnType}.gif...`);
      
      // Twitter API v1.1 is required for media upload
      const mediaId = await this.twitter.v1.uploadMedia(gifPath);
      
      console.log(`✅ GIF uploaded, media ID: ${mediaId}`);
      return mediaId;
    } catch (error) {
      console.error(`❌ GIF upload failed: ${error.message}`);
      return null;
    }
  }

  // ============================================
  // POST TWEET
  // ============================================

  async postTweet(tweetText, burnType) {
    try {
      if (this.isTestMode) {
        this.tweetCount++;
        const hasGif = fs.existsSync(this.gifs[burnType]);
        
        console.log(`\n${'='.repeat(50)}`);
        console.log(`🧪 TEST TWEET #${this.tweetCount} (${burnType})`);
        console.log(`${'='.repeat(50)}`);
        console.log(tweetText);
        console.log(`${'='.repeat(50)}`);
        console.log(`📏 Length: ${tweetText.length}/280`);
        console.log(`🎬 GIF: ${hasGif ? '✅ Would attach' : '⚠️ Not found'}`);
        console.log(`${'='.repeat(50)}\n`);
        
        return { data: { id: `test_${Date.now()}` } };
      }

      // Upload GIF first
      const mediaId = await this.uploadGif(burnType);

      // Build tweet options
      const tweetOptions = { text: tweetText };
      
      if (mediaId) {
        tweetOptions.media = { media_ids: [mediaId] };
      }

      // Post tweet
      const tweet = await this.twitter.v2.tweet(tweetOptions);
      
      this.tweetCount++;
      console.log(`✅ Tweet #${this.tweetCount} posted!`);
      console.log(`🔗 https://twitter.com/i/status/${tweet.data.id}`);
      
      return tweet;
    } catch (error) {
      console.error('❌ Tweet failed:', error.message);
      
      if (error.code === 403) {
        console.error('→ Check API permissions (need Read+Write)');
      } else if (error.code === 401) {
        console.error('→ Check API credentials in .env');
      } else if (error.code === 429) {
        console.error('→ Rate limited, wait before retrying');
      }
      
      throw error;
    }
  }

  // ============================================
  // BURN PROCESSING
  // ============================================

  getUntweetedBurns() {
    const db = getDb();
    
    const burns = db.prepare(`
      SELECT * FROM burns 
      WHERE tweet_posted = 0 OR tweet_posted IS NULL
      ORDER BY created_at ASC
    `).all();
    
    console.log(`📊 Found ${burns.length} untweeted burn(s)`);
    return burns;
  }

  markAsTweeted(burnId) {
    const db = getDb();
    
    db.prepare(`
      UPDATE burns 
      SET tweet_posted = 1, tweeted_at = datetime('now')
      WHERE id = ?
    `).run(burnId);
    
    console.log(`📝 Marked burn #${burnId} as tweeted`);
  }

  async processBurn(burn) {
    console.log(`\n🔥 Processing ${burn.burn_type} burn #${burn.id}`);
    
    if (burn.tweet_posted) {
      console.log('⏭️ Already tweeted, skipping');
      return;
    }
    
    const tweet = this.generateTweet(burn);
    await this.postTweet(tweet, burn.burn_type);
    this.markAsTweeted(burn.id);
    
    console.log('✅ Done');
  }

  async checkAndProcess() {
    const burns = this.getUntweetedBurns();
    
    if (burns.length === 0) {
      console.log('✅ No untweeted burns');
      return;
    }

    for (const burn of burns) {
      await this.processBurn(burn);
      
      // Wait between tweets
      if (burns.length > 1) {
        console.log('⏳ Waiting 5s...');
        await new Promise(r => setTimeout(r, 5000));
      }
    }
  }

  // ============================================
  // TEST MODE
  // ============================================

  async runSingleTest(testType) {
    console.log(`\n🎯 Testing ${testType} tweet\n`);
    
    const mockBurn = testType === 'milestone' 
      ? {
          id: 999,
          burn_type: 'milestone',
          burn_amount: 10000000 * 1e6, // Convert to smallest units
          tx_signature: '2ixnzM3mHdVt9bM77bpYSAL9xr9z35AFaUaDCg7pV92zgbP2MRtSobWV6Pd9hibNc3zXguyEGNc4XDHaqmUY6Xrb',
          milestone_target: 10000,
          market_cap_at_burn: 10000
        }
      : {
          id: 999,
          burn_type: 'buyback',
          burn_amount: 2019980 * 1e6, // Convert to smallest units
          tx_signature: '36hsSiwtq7MMx3WvwJqKHwkaz9FbhKBCwyuxoZJh7kA6ykWbkDMhZqZ57LjzLA1fydxRfmR2S2Cdu6M6wZD49ftm',
          sol_spent: 0.076,
          sol_price_at_burn: 118.42
        };
    
    const tweet = this.generateTweet(mockBurn);
    await this.postTweet(tweet, testType);
  }

  // ============================================
  // MAIN RUN
  // ============================================

  async run() {
    const singleTweet = process.env.SINGLE_TWEET === 'true';
    const testType = process.env.TEST_TYPE || 'milestone';
    
    console.log(`\n🔥 Inferno Burn Bot Starting...`);
    console.log(`📍 Mode: ${this.isTestMode ? 'TEST' : 'LIVE'}\n`);
    
    if (singleTweet) {
      await this.runSingleTest(testType);
      return;
    }
    
    // Initial check
    await this.checkAndProcess();
    
    // Monitor every 60 seconds
    console.log('\n👁️ Monitoring for new burns (60s interval)...\n');
    
    setInterval(async () => {
      const now = new Date().toLocaleTimeString();
      console.log(`\n⏰ [${now}] Checking...`);
      await this.checkAndProcess();
    }, 60000);

    // Keep alive
    while (true) {
      await new Promise(r => setTimeout(r, 60000));
    }
  }
}

// Entry point
const main = async () => {
  const bot = new InfernoBurnBot();
  await bot.run();
};

process.on('SIGINT', () => {
  console.log('\n👋 Shutting down...');
  process.exit(0);
});

main().catch(err => {
  console.error('💥 Fatal:', err);
  process.exit(1);
});

module.exports = { InfernoBurnBot };