#!/usr/bin/env node
/**
 * Clean all entries from the Inferno database
 */
const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'inferno.db');

function cleanDatabase() {
  const db = new Database(DB_PATH);
  
  try {
    console.log('🗑️  Cleaning Inferno database...');
    
    // Delete all records from each table
    const tables = ['burns', 'milestones', 'metrics'];
    
    tables.forEach(table => {
      const result = db.prepare(`DELETE FROM ${table}`).run();
      console.log(`✅ Deleted ${result.changes} records from ${table} table`);
    });
    
    // Reset auto-increment counters
    tables.forEach(table => {
      db.prepare(`DELETE FROM sqlite_sequence WHERE name = ?`).run(table);
      console.log(`✅ Reset auto-increment for ${table} table`);
    });
    
    // Vacuum to reclaim space
    db.prepare('VACUUM').run();
    console.log('✅ Database vacuumed');
    
    console.log('\n✨ Database cleaned successfully!');
    
  } catch (error) {
    console.error('❌ Error cleaning database:', error.message);
  } finally {
    db.close();
  }
}

// Run if called directly
if (require.main === module) {
  cleanDatabase();
}

module.exports = { cleanDatabase };