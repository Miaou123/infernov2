'use client';

import { useState, useEffect, useCallback } from 'react';

// Format numbers for display (assumes num is in smallest units with 6 decimals)
function formatNumber(num) {
  // Convert from smallest units to display units
  const displayNum = num / 1e6;
  
  if (displayNum >= 1000000) return `${(displayNum / 1000000).toFixed(2)}M`;
  if (displayNum >= 1000) return `${(displayNum / 1000).toFixed(0)}K`;
  return displayNum.toLocaleString();
}

function formatMarketCap(num) {
  if (num >= 1000000) return `$${(num / 1000000).toFixed(2)}M`;
  if (num >= 1000) return `$${(num / 1000).toFixed(0)}K`;
  return `$${num.toFixed(0)}`;
}

function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function shortenTx(tx) {
  if (!tx) return '';
  return `${tx.slice(0, 6)}...${tx.slice(-4)}`;
}

export default function Home() {
  // State
  const [tokenAddress, setTokenAddress] = useState('Loading...');
  const [burnStats, setBurnStats] = useState(null);
  const [milestones, setMilestones] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [burns, setBurns] = useState([]);
  const [activeTab, setActiveTab] = useState('milestone');
  const [isLoading, setIsLoading] = useState(true);

  // Fetch all data
  const fetchData = useCallback(async () => {
    try {
      const [tokenRes, statsRes, milestonesRes, metricsRes, burnsRes] = await Promise.all([
        fetch('/api/token').then(r => r.json()),
        fetch('/api/burn-stats').then(r => r.json()),
        fetch('/api/milestones').then(r => r.json()),
        fetch('/api/metrics').then(r => r.json()),
        fetch('/api/burns?limit=10').then(r => r.json())
      ]);

      if (tokenRes.success) setTokenAddress(tokenRes.tokenAddress);
      if (statsRes.success) setBurnStats(statsRes);
      setMilestones(milestonesRes);
      setMetrics(metricsRes);
      setBurns(burnsRes.burns || []);
      setIsLoading(false);
    } catch (error) {
      console.error('Error fetching data:', error);
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, [fetchData]);

  // Copy to clipboard
  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(tokenAddress);
      // Could add toast notification here
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  // Filter burns by type
  const milestoneBurns = burns.filter(b => b.burnType === 'milestone');
  const buybackBurns = burns.filter(b => b.burnType === 'buyback');

  return (
    <main className="container" style={{ paddingTop: '40px', paddingBottom: '40px' }}>
      {/* Hero Section */}
      <section className="hero">
        <h1 className="hero-title">$INFERNO</h1>
        <p className="hero-subtitle">
          Deflationary token on Solana with automatic buyback & milestone-based burns. 
          Watch the supply shrink in real-time.
        </p>
        
        {/* Contract Address */}
        <div className="contract-display">
          <span id="contract-address">{tokenAddress}</span>
          <span className="copy-icon" onClick={copyAddress}>📋</span>
        </div>
      </section>

      {/* Protocol Metrics */}
      <section className="section">
        <h2 className="section-title">PROTOCOL METRICS</h2>
        <div className="burn-metrics">
          <div className="metric-label">
            <span>Total Tokens Burned</span>
            <div className="live-indicator">
              <span className="live-dot"></span>
              <span>LIVE</span>
            </div>
          </div>
          
          <div className="burn-value">
            {isLoading ? (
              <div className="skeleton" style={{ width: '200px', height: '48px', margin: '0 auto' }} />
            ) : (
              formatNumber(burnStats?.totalBurned || 0)
            )}
          </div>
          
          <div className="progress-container">
            <div className="progress-bar-bg">
              <div 
                className="progress-bar" 
                style={{ width: `${burnStats?.burnPercentage || 0}%` }}
              />
            </div>
            <div className="progress-info">
              <div>0</div>
              <div>1,000,000,000</div>
            </div>
            <div className="progress-percentage">
              {burnStats?.burnPercentage || '0.00'}%
            </div>
          </div>
        </div>
      </section>

      {/* Detailed Burn Metrics */}
      <section className="section" id="metrics">
        <h2 className="section-title">DETAILED BURN METRICS</h2>
        
        {/* Tabs */}
        <div className="burn-tabs">
          <button 
            className={`burn-tab ${activeTab === 'milestone' ? 'active' : ''}`}
            onClick={() => setActiveTab('milestone')}
          >
            Milestone Burns
          </button>
          <button 
            className={`burn-tab ${activeTab === 'buyback' ? 'active' : ''}`}
            onClick={() => setActiveTab('buyback')}
          >
            Automated Buyback & Burns
          </button>
        </div>

        {/* Milestone Burns Tab */}
        {activeTab === 'milestone' && (
          <div className="milestone-burns">
            {/* Market Cap Display */}
            <div className="market-cap-showcase">
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                CURRENT MARKET CAP
              </div>
              <div className="market-cap-value">
                {isLoading ? (
                  <div className="skeleton" style={{ width: '150px', height: '40px', margin: '0 auto' }} />
                ) : (
                  formatMarketCap(milestones?.currentMarketCap || 0)
                )}
              </div>
            </div>

            {/* Milestone Progress */}
            <div className="milestone-ladder">
              <div className="ladder-track">
                <div 
                  className="ladder-progress" 
                  style={{ width: `${milestones?.progress || 0}%` }}
                />
              </div>
              
              {/* Milestone Markers */}
              {milestones?.milestones && (
                <div className="milestone-markers">
                  {milestones.milestones.slice(0, 6).map((m, i) => (
                    <div 
                      key={i} 
                      className={`milestone-marker ${m.completed ? 'completed' : ''} ${milestones.nextMilestone?.marketCap === m.marketCap ? 'next' : ''}`}
                    >
                      <span>{formatMarketCap(m.marketCap).replace('$', '')}</span>
                      <span style={{ fontSize: '10px' }}>{m.completed ? '✓' : '○'}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Milestone History */}
            <h3 style={{ fontSize: '14px', marginTop: '30px', marginBottom: '15px', color: 'var(--text-secondary)' }}>
              MILESTONE BURN HISTORY
            </h3>
            <table className="history-table">
              <thead>
                <tr>
                  <th>Milestone</th>
                  <th>Amount Burned</th>
                  <th>Date</th>
                  <th>Transaction</th>
                </tr>
              </thead>
              <tbody>
                {milestoneBurns.length > 0 ? (
                  milestoneBurns.map((burn, i) => (
                    <tr key={i}>
                      <td>{formatMarketCap(burn.milestoneTarget || 0)}</td>
                      <td style={{ color: 'var(--accent-primary)' }}>
                        {formatNumber(burn.burnAmount)} INFERNO
                      </td>
                      <td>{formatDate(burn.timestamp)}</td>
                      <td>
                        <a 
                          href={`https://solscan.io/tx/${burn.txSignature}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="tx-link"
                        >
                          {shortenTx(burn.txSignature)}
                        </a>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                      No milestone burns yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Buyback Burns Tab */}
        {activeTab === 'buyback' && (
          <div className="buyback-burns">
            {/* Buyback Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '30px' }}>
              <div style={{ background: 'var(--bg-tertiary)', padding: '20px', borderRadius: '12px', textAlign: 'center' }}>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                  TOTAL BUYBACK BURNED
                </div>
                <div style={{ fontSize: '24px', fontWeight: '600', color: 'var(--accent-secondary)' }}>
                  {formatNumber(burnStats?.burnsByType?.buyback || 0)}
                </div>
              </div>
              <div style={{ background: 'var(--bg-tertiary)', padding: '20px', borderRadius: '12px', textAlign: 'center' }}>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                  BUYBACK COUNT
                </div>
                <div style={{ fontSize: '24px', fontWeight: '600', color: 'var(--accent-secondary)' }}>
                  {burnStats?.burnsByType?.buybackCount || 0}
                </div>
              </div>
              <div style={{ background: 'var(--bg-tertiary)', padding: '20px', borderRadius: '12px', textAlign: 'center' }}>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                  24H BURNED
                </div>
                <div style={{ fontSize: '24px', fontWeight: '600', color: 'var(--accent-secondary)' }}>
                  {formatNumber(burnStats?.burns24h || 0)}
                </div>
              </div>
            </div>

            {/* Buyback History */}
            <h3 style={{ fontSize: '14px', marginBottom: '15px', color: 'var(--text-secondary)' }}>
              BUYBACK BURN HISTORY
            </h3>
            <table className="history-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>SOL Spent</th>
                  <th>Tokens Bought</th>
                  <th>Tokens Burned</th>
                  <th>Transaction</th>
                </tr>
              </thead>
              <tbody>
                {buybackBurns.length > 0 ? (
                  buybackBurns.map((burn, i) => (
                    <tr key={i}>
                      <td>{formatDate(burn.timestamp)}</td>
                      <td>{burn.solSpent?.toFixed(4) || '0'} SOL</td>
                      <td>{formatNumber(burn.tokensBought || 0)}</td>
                      <td style={{ color: 'var(--accent-primary)' }}>
                        {formatNumber(burn.burnAmount)} INFERNO
                      </td>
                      <td>
                        <a 
                          href={`https://solscan.io/tx/${burn.txSignature}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="tx-link"
                        >
                          {shortenTx(burn.txSignature)}
                        </a>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                      No buyback burns yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Tokenomics */}
      <section className="section" id="tokenomics">
        <h2 className="section-title">TOKENOMICS</h2>
        <div className="tokenomics-grid">
          <div className="tokenomics-card">
            <div className="tokenomics-icon">
              <svg viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="#FF4500" strokeWidth="2"/>
                <text x="12" y="16" textAnchor="middle" fill="#FF4500" fontSize="10" fontWeight="bold">1B</text>
              </svg>
            </div>
            <div className="tokenomics-title">1 Billion Supply</div>
            <div className="tokenomics-description">
              Fixed initial supply of 1,000,000,000 tokens with no minting capability.
            </div>
          </div>

          <div className="tokenomics-card">
            <div className="tokenomics-icon">
              <svg viewBox="0 0 24 24" fill="#FF4500">
                <path d="M12 2C8 2 4 6 4 12C4 14 6 18 12 22C18 18 20 14 20 12C20 6 16 2 12 2Z"/>
                <path d="M12 6C10 6 8 8 8 12C8 14 10 16 12 18C14 16 16 14 16 12C16 8 14 6 12 6Z" fill="#FF8C00"/>
              </svg>
            </div>
            <div className="tokenomics-title">25% Burn Reserve</div>
            <div className="tokenomics-description">
              25% of tokens allocated for milestone burns as market cap grows.
            </div>
          </div>

          <div className="tokenomics-card">
            <div className="tokenomics-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="#FF4500" strokeWidth="2">
                <rect x="2" y="6" width="20" height="12" rx="2"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
            </div>
            <div className="tokenomics-title">Zero Tax</div>
            <div className="tokenomics-description">
              No transaction fees or taxes - pure trading experience.
            </div>
          </div>

          <div className="tokenomics-card">
            <div className="tokenomics-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="#FF4500" strokeWidth="2">
                <path d="M12 12C16 8 20 8 20 12C20 16 16 16 12 12C8 16 4 16 4 12C4 8 8 8 12 12Z"/>
              </svg>
            </div>
            <div className="tokenomics-title">Automated Burn Loop</div>
            <div className="tokenomics-description">
              Creator rewards automatically bought back and burned every 15 minutes.
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="footer">
        <h2 className="section-title">JOIN THE INFERNO</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '20px' }}>
          Follow our socials to stay updated
        </p>
        <div className="social-links">
          <a href="#" className="social-link">𝕏</a>
        </div>
        <p style={{ marginTop: '30px', fontSize: '14px', color: 'var(--text-muted)' }}>
          © 2025 INFERNO Protocol. All rights reserved.
        </p>
        <p className="disclaimer">
          This website is not financial advice. $INFERNO has no intrinsic value.
        </p>
      </footer>
    </main>
  );
}
