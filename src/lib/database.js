/**
 * SQLite Database Module for $INFERNO Token
 * Handles all burn records and metrics storage
 */
const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'inferno.db');

let db = null;

/**
 * Initialize database connection and create tables
 */
function initDatabase() {
  if (db) return db;
  
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  
  // Create burns table
  db.exec(`
    CREATE TABLE IF NOT EXISTS burns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      burn_type TEXT NOT NULL CHECK(burn_type IN ('milestone', 'buyback')),
      burn_amount INTEGER NOT NULL,
      tx_signature TEXT UNIQUE NOT NULL,
      market_cap_at_burn REAL,
      sol_price_at_burn REAL,
      token_price_at_burn REAL,
      milestone_target INTEGER,
      sol_spent REAL,
      tokens_bought INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Create milestones table
  db.exec(`
    CREATE TABLE IF NOT EXISTS milestones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      market_cap INTEGER UNIQUE NOT NULL,
      burn_amount INTEGER NOT NULL,
      percent_of_supply REAL NOT NULL,
      completed INTEGER DEFAULT 0,
      completed_at DATETIME,
      tx_signature TEXT
    )
  `);
  
  // Create metrics table for snapshots
  db.exec(`
    CREATE TABLE IF NOT EXISTS metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      total_burned INTEGER NOT NULL,
      circulating_supply INTEGER NOT NULL,
      milestone_burned INTEGER DEFAULT 0,
      buyback_burned INTEGER DEFAULT 0,
      market_cap REAL,
      token_price REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Create indexes for performance
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_burns_type ON burns(burn_type);
    CREATE INDEX IF NOT EXISTS idx_burns_created ON burns(created_at);
    CREATE INDEX IF NOT EXISTS idx_milestones_completed ON milestones(completed);
  `);
  
  return db;
}

/**
 * Get database instance
 */
function getDb() {
  if (!db) initDatabase();
  return db;
}

/**
 * Record a new burn transaction
 */
function recordBurn(burnData) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO burns (burn_type, burn_amount, tx_signature, market_cap_at_burn, sol_price_at_burn, token_price_at_burn, milestone_target, sol_spent, tokens_bought)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  return stmt.run(
    burnData.burnType,
    burnData.burnAmount,
    burnData.txSignature,
    burnData.marketCap || null,
    burnData.solPrice || null,
    burnData.tokenPrice || null,
    burnData.milestoneTarget || null,
    burnData.solSpent || null,
    burnData.tokensBought || null
  );
}

/**
 * Get all burns with pagination
 */
function getBurns({ limit = 50, offset = 0, burnType = null } = {}) {
  const db = getDb();
  
  let query = 'SELECT * FROM burns';
  const params = [];
  
  if (burnType) {
    query += ' WHERE burn_type = ?';
    params.push(burnType);
  }
  
  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);
  
  return db.prepare(query).all(...params);
}

/**
 * Get total burned amount
 */
function getTotalBurned() {
  const db = getDb();
  const result = db.prepare('SELECT COALESCE(SUM(burn_amount), 0) as total FROM burns').get();
  return result.total;
}

/**
 * Get burns by type
 */
function getBurnsByType() {
  const db = getDb();
  const result = db.prepare(`
    SELECT 
      burn_type,
      COALESCE(SUM(burn_amount), 0) as total,
      COUNT(*) as count
    FROM burns
    GROUP BY burn_type
  `).all();
  
  const summary = { milestone: 0, buyback: 0, milestoneCount: 0, buybackCount: 0 };
  result.forEach(row => {
    summary[row.burn_type] = row.total;
    summary[`${row.burn_type}Count`] = row.count;
  });
  
  return summary;
}

/**
 * Get burns in last 24 hours
 */
function getBurns24h() {
  const db = getDb();
  const result = db.prepare(`
    SELECT COALESCE(SUM(burn_amount), 0) as total
    FROM burns
    WHERE created_at >= datetime('now', '-24 hours')
  `).get();
  return result.total;
}

/**
 * Get recent burns
 */
function getRecentBurns(limit = 5) {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM burns
    ORDER BY created_at DESC
    LIMIT ?
  `).all(limit);
}

/**
 * Initialize milestones from config
 */
function initMilestones(schedule) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO milestones (market_cap, burn_amount, percent_of_supply)
    VALUES (?, ?, ?)
  `);
  
  const insertMany = db.transaction((milestones) => {
    for (const m of milestones) {
      stmt.run(m.marketCap, m.burnAmount, m.percentOfSupply);
    }
  });
  
  insertMany(schedule);
}

/**
 * Get all milestones
 */
function getMilestones() {
  const db = getDb();
  return db.prepare('SELECT * FROM milestones ORDER BY market_cap ASC').all();
}

/**
 * Get pending milestones (reached but not completed)
 */
function getPendingMilestones(currentMarketCap) {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM milestones
    WHERE completed = 0 AND market_cap <= ?
    ORDER BY market_cap ASC
  `).all(currentMarketCap);
}

/**
 * Get next milestone
 */
function getNextMilestone() {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM milestones
    WHERE completed = 0
    ORDER BY market_cap ASC
    LIMIT 1
  `).get();
}

/**
 * Mark milestone as completed
 */
function completeMilestone(marketCap, txSignature) {
  const db = getDb();
  return db.prepare(`
    UPDATE milestones
    SET completed = 1, completed_at = datetime('now'), tx_signature = ?
    WHERE market_cap = ?
  `).run(txSignature, marketCap);
}

/**
 * Get milestone stats
 */
function getMilestoneStats() {
  const db = getDb();
  const stats = db.prepare(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN completed = 1 THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN completed = 1 THEN burn_amount ELSE 0 END) as total_burned
    FROM milestones
  `).get();
  return stats;
}

/**
 * Save metrics snapshot
 */
function saveMetrics(metricsData) {
  const db = getDb();
  return db.prepare(`
    INSERT INTO metrics (total_burned, circulating_supply, milestone_burned, buyback_burned, market_cap, token_price)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    metricsData.totalBurned,
    metricsData.circulatingSupply,
    metricsData.milestoneBurned || 0,
    metricsData.buybackBurned || 0,
    metricsData.marketCap || null,
    metricsData.tokenPrice || null
  );
}

/**
 * Get latest metrics
 */
function getLatestMetrics() {
  const db = getDb();
  return db.prepare('SELECT * FROM metrics ORDER BY created_at DESC LIMIT 1').get();
}

/**
 * Get comprehensive burn stats
 */
function getBurnStats() {
  const initialSupply = parseInt(process.env.INITIAL_SUPPLY) || 1000000000;
  const totalBurned = getTotalBurned();
  const burnsByType = getBurnsByType();
  const burns24h = getBurns24h();
  const recentBurns = getRecentBurns(5);
  const milestoneStats = getMilestoneStats();
  
  // Convert totalBurned from smallest units to display units for percentage calculation
  const totalBurnedDisplayUnits = totalBurned / 1e6;
  const circulatingSupplyDisplayUnits = initialSupply - totalBurnedDisplayUnits;
  
  return {
    totalBurned,
    burnsByType,
    burns24h,
    recentBurns,
    initialSupply,
    circulatingSupply: totalBurned, // Keep in smallest units for frontend formatting
    burnPercentage: ((totalBurnedDisplayUnits / initialSupply) * 100).toFixed(2),
    milestoneStats,
    timestamp: new Date().toISOString()
  };
}

/**
 * Close database connection
 */
function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = {
  initDatabase,
  getDb,
  recordBurn,
  getBurns,
  getTotalBurned,
  getBurnsByType,
  getBurns24h,
  getRecentBurns,
  initMilestones,
  getMilestones,
  getPendingMilestones,
  getNextMilestone,
  completeMilestone,
  getMilestoneStats,
  saveMetrics,
  getLatestMetrics,
  getBurnStats,
  closeDb
};
