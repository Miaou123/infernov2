#!/usr/bin/env node
/**
 * Database Initialization Script for $INFERNO Token
 * Sets up SQLite database and loads initial milestone configuration
 */
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const { initDatabase, initMilestones, getMilestones } = require('../lib/database');
const { CONSTANTS, formatMarketCap, formatTokenAmount } = require('../lib/config');

console.log('🔥 $INFERNO Database Initialization');
console.log('=====================================\n');

// Ensure data directory exists
const dataDir = path.join(__dirname, '../../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
  console.log('✅ Created data directory');
}

// Initialize database
console.log('📦 Initializing SQLite database...');
initDatabase();
console.log('✅ Database initialized\n');

// Load milestone configuration
console.log('📊 Loading milestone configuration...');
initMilestones(CONSTANTS.BURN_SCHEDULE);

// Display loaded milestones
const milestones = getMilestones();
console.log(`✅ Loaded ${milestones.length} milestones:\n`);

console.log('┌─────────────────┬────────────────────┬─────────────┐');
console.log('│   Market Cap    │    Burn Amount     │  % Supply   │');
console.log('├─────────────────┼────────────────────┼─────────────┤');

milestones.forEach(m => {
  const mcap = formatMarketCap(m.market_cap).padStart(12);
  const burn = formatTokenAmount(m.burn_amount).padStart(15);
  const pct = `${m.percent_of_supply.toFixed(2)}%`.padStart(8);
  console.log(`│ ${mcap}    │ ${burn}    │  ${pct}   │`);
});

console.log('└─────────────────┴────────────────────┴─────────────┘\n');

// Calculate totals
const totalBurnAmount = milestones.reduce((sum, m) => sum + m.burn_amount, 0);
const totalBurnPercent = milestones.reduce((sum, m) => sum + m.percent_of_supply, 0);

console.log(`📈 Total burn potential: ${formatTokenAmount(totalBurnAmount)} tokens (${totalBurnPercent.toFixed(2)}% of supply)\n`);

console.log('✅ Database initialization complete!');
console.log('\nNext steps:');
console.log('  1. Configure your .env file with wallet keys');
console.log('  2. Run: npm run dev (to start the Next.js server)');
console.log('  3. Run: npm run buyback (to start buyback monitoring)');
console.log('  4. Run: npm run milestone (to start milestone monitoring)');