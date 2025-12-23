/**
 * Milestone Burn Configuration for $INFERNO Token
 * Defines the burn schedule at various market cap thresholds
 */

const BURN_SCHEDULE = [
  { marketCap: 10000, burnAmount: 10000000, percentOfSupply: 1.00 },
  { marketCap: 50000, burnAmount: 15000000, percentOfSupply: 1.50 },
  { marketCap: 100000, burnAmount: 25000000, percentOfSupply: 2.50 },
  { marketCap: 200000, burnAmount: 20000000, percentOfSupply: 2.00 },
  { marketCap: 300000, burnAmount: 17500000, percentOfSupply: 1.75 },
  { marketCap: 500000, burnAmount: 17500000, percentOfSupply: 1.75 },
  { marketCap: 750000, burnAmount: 15000000, percentOfSupply: 1.50 },
  { marketCap: 1000000, burnAmount: 15000000, percentOfSupply: 1.50 },
  { marketCap: 1500000, burnAmount: 10000000, percentOfSupply: 1.00 },
  { marketCap: 2500000, burnAmount: 10000000, percentOfSupply: 1.00 },
  { marketCap: 3500000, burnAmount: 7500000, percentOfSupply: 0.75 },
  { marketCap: 5000000, burnAmount: 7500000, percentOfSupply: 0.75 },
  { marketCap: 7500000, burnAmount: 7500000, percentOfSupply: 0.75 },
  { marketCap: 10000000, burnAmount: 7500000, percentOfSupply: 0.75 },
  { marketCap: 15000000, burnAmount: 5000000, percentOfSupply: 0.50 },
  { marketCap: 25000000, burnAmount: 5000000, percentOfSupply: 0.50 },
  { marketCap: 35000000, burnAmount: 5000000, percentOfSupply: 0.50 },
  { marketCap: 50000000, burnAmount: 5000000, percentOfSupply: 0.50 },
  { marketCap: 75000000, burnAmount: 7500000, percentOfSupply: 0.75 },
  { marketCap: 90000000, burnAmount: 7500000, percentOfSupply: 0.75 },
  { marketCap: 100000000, burnAmount: 30000000, percentOfSupply: 3.00 }
];

/**
 * Format market cap for display
 */
function formatMarketCap(value) {
  if (value >= 1000000) {
    return `$${(value / 1000000).toFixed(1)}M`;
  }
  if (value >= 1000) {
    return `$${(value / 1000).toFixed(0)}K`;
  }
  return `$${value}`;
}

/**
 * Format token amount for display
 */
function formatTokenAmount(amount) {
  if (amount >= 1000000) {
    return `${(amount / 1000000).toFixed(2)}M`;
  }
  if (amount >= 1000) {
    return `${(amount / 1000).toFixed(0)}K`;
  }
  return amount.toLocaleString();
}

module.exports = {
  BURN_SCHEDULE,
  formatMarketCap,
  formatTokenAmount
};
