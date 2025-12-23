# $INFERNO Token - Next.js Edition

A deflationary token on the Solana blockchain with automatic buyback and milestone-based burns, rebuilt with Next.js and SQLite.

## 🔥 Features

- **Automatic Buyback & Burn**: Collects creator rewards from PumpFun every 15 minutes and burns them
- **Milestone Burns**: Automatic burns triggered at market cap thresholds
- **Real-time Dashboard**: Next.js frontend with live burn tracking
- **SQLite Database**: Clean, persistent storage for all burn records
- **API Routes**: RESTful API for all data access

## 📁 Project Structure

```
inferno-next/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── api/               # API routes
│   │   │   ├── burns/         # Burn history endpoint
│   │   │   ├── burn-stats/    # Comprehensive stats
│   │   │   ├── metrics/       # Token metrics
│   │   │   ├── milestones/    # Milestone status
│   │   │   └── token/         # Token info
│   │   ├── globals.css        # Global styles
│   │   ├── layout.js          # Root layout
│   │   └── page.js            # Dashboard page
│   ├── lib/                   # Shared libraries
│   │   ├── database.js        # SQLite operations
│   │   ├── solana.js          # Solana utilities
│   │   ├── priceOracle.js     # Price fetching
│   │   ├── pumpfun.js         # PumpFun operations
│   │   └── burnConfig.js      # Milestone config
│   └── scripts/               # Standalone scripts
│       ├── buyback.js         # Buyback cron job
│       ├── milestone.js       # Milestone monitor
│       └── init-db.js         # Database setup
├── data/                      # SQLite database storage
├── .env.example              # Environment template
├── package.json
└── next.config.js
```

## 🚀 Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your configuration
```

### 3. Initialize Database

```bash
npm run init-db
```

### 4. Start Development Server

```bash
npm run dev
```

### 5. Start Background Scripts

In separate terminals:

```bash
# Buyback script (every 15 minutes)
npm run buyback

# Milestone monitor (every 5 minutes)
npm run milestone
```

Or run everything together:

```bash
npm run start-all
```

## 📊 API Endpoints

### GET /api/burns
Get burn history with pagination.

Query params:
- `limit` - Number of burns to return (default: 50)
- `page` - Page number (default: 1)
- `type` - Filter by burn type: `milestone` or `buyback`

### GET /api/burn-stats
Get comprehensive burn statistics including totals, 24h burns, and recent activity.

### GET /api/milestones
Get all milestones with completion status and current progress.

### GET /api/metrics
Get token metrics including price, market cap, and supply info.

### GET /api/token
Get token address and basic info.

## 🔧 Configuration

### Milestone Schedule

The burn schedule is defined in `src/lib/burnConfig.js`:

| Market Cap | Burn Amount | % Supply |
|------------|-------------|----------|
| $10K       | 10M         | 1.00%    |
| $50K       | 15M         | 1.50%    |
| $100K      | 25M         | 2.50%    |
| $200K      | 20M         | 2.00%    |
| ...        | ...         | ...      |
| $100M      | 30M         | 3.00%    |

### Environment Variables

Key variables to configure:

- `TOKEN_ADDRESS` - Your token mint address
- `WALLET_PRIVATE_KEY` - Main wallet for buybacks
- `RESERVE_WALLET_PRIVATE_KEY` - Reserve wallet for milestone burns
- `HELIUS_RPC_URL` - RPC endpoint (Helius recommended)
- `REWARDS_CLAIM_THRESHOLD` - Minimum SOL to trigger buyback
- `BUYBACK_INTERVAL_MINUTES` - Buyback check frequency
- `MILESTONE_CHECK_INTERVAL_MINUTES` - Milestone check frequency

## 📈 Database Schema

### burns
- `id` - Primary key
- `burn_type` - 'milestone' or 'buyback'
- `burn_amount` - Tokens burned
- `tx_signature` - Solana transaction signature
- `market_cap_at_burn` - Market cap at time of burn
- `sol_price_at_burn` - SOL price at time of burn
- `token_price_at_burn` - Token price at time of burn
- `milestone_target` - For milestone burns, the target market cap
- `sol_spent` - For buybacks, SOL used
- `tokens_bought` - For buybacks, tokens acquired
- `created_at` - Timestamp

### milestones
- `id` - Primary key
- `market_cap` - Target market cap
- `burn_amount` - Tokens to burn
- `percent_of_supply` - Percentage of total supply
- `completed` - Whether milestone is complete
- `completed_at` - Completion timestamp
- `tx_signature` - Burn transaction signature

### metrics
- `id` - Primary key
- `total_burned` - Total tokens burned
- `circulating_supply` - Current circulating supply
- `milestone_burned` - Tokens burned via milestones
- `buyback_burned` - Tokens burned via buybacks
- `market_cap` - Market cap at snapshot
- `token_price` - Token price at snapshot
- `created_at` - Timestamp

## 🛠 Development

### Running Tests

```bash
npm test
```

### Building for Production

```bash
npm run build
npm run start
```

## 📜 License

MIT

## ⚠️ Disclaimer

This software is provided as-is. $INFERNO has no intrinsic value. Always do your own research before investing in any cryptocurrency.
