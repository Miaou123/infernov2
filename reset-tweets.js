#!/usr/bin/env node
/**
 * Reset tweet flags in database to allow re-posting
 */
const { initDatabase, getDb } = require('./src/lib/database');

function resetTweetFlags() {
  console.log('🔄 Resetting tweet flags in database...');
  
  // Initialize database
  initDatabase();
  const db = getDb();
  
  try {
    // Reset all tweet_posted flags to 0
    const result = db.prepare(`
      UPDATE burns 
      SET tweet_posted = 0, tweeted_at = NULL
    `).run();
    
    console.log(`✅ Reset ${result.changes} burn records`);
    
    // Show burns that can now be tweeted
    const burns = db.prepare(`
      SELECT id, burn_type, burn_amount, created_at 
      FROM burns 
      ORDER BY created_at DESC
      LIMIT 5
    `).all();
    
    console.log('\n📊 Recent burns that can now be tweeted:');
    burns.forEach((burn, i) => {
      const tokens = Math.round(burn.burn_amount / 1e6).toLocaleString();
      console.log(`  ${i + 1}. ${burn.burn_type} - ${tokens} tokens (ID: ${burn.id})`);
    });
    
    console.log('\n🔥 Ready to tweet! Run your bot now.');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

resetTweetFlags();