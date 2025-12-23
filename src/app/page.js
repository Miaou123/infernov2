'use client';

import { useState, useEffect, useCallback } from 'react';
import Header from '@/components/Header';
import styles from './page.module.css';

// Format numbers for display (assumes num is in smallest units with 6 decimals)
function formatNumber(num) {
  const displayNum = num / 1e6;
  
  if (displayNum >= 1000000) return `${(displayNum / 1000000).toFixed(2)}M`;
  if (displayNum >= 1000) return `${(displayNum / 1000).toFixed(0)}K`;
  return displayNum.toLocaleString();
}

function formatMarketCap(num) {
  if (num >= 1000000) return `$${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `$${(num / 1000).toFixed(1)}K`;
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

// Countdown timer component for next burn cycle
// Based on 15-minute cron schedule (runs at :00, :15, :30, :45)
function BurnCountdown() {
  const [timeLeft, setTimeLeft] = useState('');
  const BURN_INTERVAL_MINUTES = 15;

  useEffect(() => {
    const calculateTimeLeft = () => {
      const now = new Date();
      const currentMinutes = now.getMinutes();
      const currentSeconds = now.getSeconds();
      
      // Calculate minutes until next 15-minute mark (0, 15, 30, 45)
      const minutesPastLastCycle = currentMinutes % BURN_INTERVAL_MINUTES;
      const minutesUntilNext = BURN_INTERVAL_MINUTES - minutesPastLastCycle - 1;
      const secondsUntilNext = 60 - currentSeconds;
      
      // Adjust if we're exactly on a second boundary
      let displayMinutes = minutesUntilNext;
      let displaySeconds = secondsUntilNext;
      
      if (secondsUntilNext === 60) {
        displayMinutes = minutesUntilNext + 1;
        displaySeconds = 0;
      }
      
      // If we're very close to the next cycle (within a few seconds)
      if (displayMinutes === 0 && displaySeconds <= 5) {
        return 'Running...';
      }
      
      return `~${displayMinutes}:${displaySeconds.toString().padStart(2, '0')}`;
    };

    // Initial calculation
    setTimeLeft(calculateTimeLeft());

    // Update every second
    const interval = setInterval(() => {
      setTimeLeft(calculateTimeLeft());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  return <span>{timeLeft}</span>;
}

export default function Home() {
  // State
  const [tokenAddress, setTokenAddress] = useState('Loading...');
  const [reserveWallet, setReserveWallet] = useState('');
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

      if (tokenRes.success) {
        setTokenAddress(tokenRes.tokenAddress);
        setReserveWallet(tokenRes.reserveWallet || '');
      }
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
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Copy to clipboard
  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(tokenAddress);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  // Filter burns by type
  const milestoneBurns = burns.filter(b => b.burnType === 'milestone');
  const buybackBurns = burns.filter(b => b.burnType === 'buyback');

  // Calculate milestone stats
  const completedMilestones = milestones?.milestones?.filter(m => m.completed)?.length || 0;
  const totalMilestones = milestones?.milestones?.length || 21;
  const milestoneBurnedAmount = milestones?.milestones
    ?.filter(m => m.completed)
    ?.reduce((sum, m) => sum + (m.burnAmount || 0), 0) || 0;
  const milestoneBurnPercentage = ((milestoneBurnedAmount / 1e6) / 1000000000 * 100).toFixed(2);
  const nextMilestone = milestones?.milestones?.find(m => !m.completed);

  return (
    <main className="container">
      {/* Header with Navigation */}
      <Header onRefresh={fetchData} />
      
      {/* Hero Section - v1 Style */}
      <section className={styles.hero}>
        <div className={styles.heroBackground}></div>
        
        {/* Logo Container with Glow */}
        <div className={styles.logoContainer}>
          <div className={styles.logoGlow}></div>
          <img 
            src="/images/logo.png" 
            className={styles.logo} 
            alt="INFERNO Logo"
          />
        </div>
        
        {/* Slogan */}
        <p className={styles.slogan}>BURN PROTOCOL ACTIVATED</p>
        
        {/* Action Buttons */}
        <div className={styles.heroButtons}>
          <a href="#" className={styles.button}>
            CHART
            <span className={styles.buttonIcon}>↗</span>
          </a>
          <a href="#metrics" className={`${styles.button} ${styles.buttonOutline}`}>
            VIEW BURNS
            <span className={styles.buttonIcon}>↓</span>
          </a>
        </div>
        
        {/* Contract Address Display */}
        <div className={styles.contractDisplay}>
          <div className={styles.contractAddress}>
            <span id="contract-address">{tokenAddress}</span>
            <span className={styles.copyIcon} onClick={copyAddress}>📋</span>
          </div>
        </div>
      </section>

      {/* Protocol Metrics */}
      <section className="section">
        <h2 className="section-title">PROTOCOL METRICS</h2>
        <div className={styles.burnMetrics}>
          <div className={styles.metricLabel}>
            <span>Total Tokens Burned</span>
            <div className={styles.liveIndicator}>
              <span className={styles.liveDot}></span>
              <span>LIVE</span>
            </div>
          </div>
          
          <div className={styles.burnValue}>
            {isLoading ? (
              <div className="skeleton" style={{ width: '200px', height: '48px', margin: '0 auto' }} />
            ) : (
              formatNumber(burnStats?.totalBurned || 0)
            )}
          </div>
          
          <div className={styles.progressContainer}>
            <div className={styles.progressBarBg}>
              <div 
                className={styles.progressBar} 
                style={{ width: `${burnStats?.burnPercentage || 0}%` }}
              >
                <div className={styles.progressFireEffect}></div>
              </div>
            </div>
            <div className={styles.progressInfo}>
              <div>0</div>
              <div>1,000,000,000</div>
            </div>
            <div className={styles.progressPercentage}>
              {burnStats?.burnPercentage || '0.00'}%
            </div>
          </div>
        </div>
      </section>

      {/* Detailed Burn Metrics */}
      <section className="section" id="metrics">
        <h2 className="section-title">DETAILED BURN METRICS</h2>
        
        {/* Tabs */}
        <div className={styles.burnTabs}>
          <button 
            className={`${styles.burnTab} ${activeTab === 'milestone' ? styles.active : ''}`}
            onClick={() => setActiveTab('milestone')}
          >
            Milestone Burns
          </button>
          <button 
            className={`${styles.burnTab} ${activeTab === 'buyback' ? styles.active : ''}`}
            onClick={() => setActiveTab('buyback')}
          >
            Automated Buyback & Burns
          </button>
        </div>

        {/* Tab Content */}
        <div className={styles.metricsPanel}>
          {activeTab === 'milestone' ? (
            <>
              <div className={styles.metricRow}>
                <div className={styles.metricLabel}>Milestone Burn Progress</div>
                <div className={styles.liveIndicator}>
                  <span className={styles.liveDot}></span>
                  <span>LIVE</span>
                </div>
              </div>
              
              {/* Market Cap Display with Flames */}
              <div className={styles.marketCapShowcase}>
                <div className={styles.marketCapDisplay}>
                  <div className={styles.marketCapTitle}>CURRENT MARKET CAP</div>
                  <div className={styles.marketCapValue}>
                    {isLoading ? '...' : formatMarketCap(milestones?.currentMarketCap || metrics?.marketCap || 0)}
                  </div>
                  {/* Fire Animation Container */}
                  <div className={styles.fireContainer}>
                    <div className={styles.fireBase}></div>
                    <div className={`${styles.fireParticle} ${styles.fireParticle1}`}></div>
                    <div className={`${styles.fireParticle} ${styles.fireParticle2}`}></div>
                    <div className={`${styles.fireParticle} ${styles.fireParticle3}`}></div>
                    <div className={`${styles.fireParticle} ${styles.fireParticle4}`}></div>
                    <div className={`${styles.fireParticle} ${styles.fireParticle5}`}></div>
                  </div>
                </div>
              </div>

              {/* Milestone Stats Grid */}
              <div className={styles.burnStatsGrid}>
                <div className={styles.statCard}>
                  <div className={styles.statLabel}>Milestones Completed</div>
                  <div className={styles.statValue}>{completedMilestones} of {totalMilestones}</div>
                </div>
                <div className={styles.statCard}>
                  <div className={styles.statLabel}>Milestone Tokens Burned</div>
                  <div className={styles.statValue}>{formatNumber(milestoneBurnedAmount)}</div>
                </div>
                <div className={styles.statCard}>
                  <div className={styles.statLabel}>Supply Burned via Milestones</div>
                  <div className={styles.statValue}>{milestoneBurnPercentage}%</div>
                </div>
                <div className={styles.statCard}>
                  <div className={styles.statLabel}>Next Milestone</div>
                  <div className={`${styles.statValue} ${styles.highlight}`}>
                    {nextMilestone ? formatMarketCap(nextMilestone.marketCap) : 'All Complete!'}
                  </div>
                  {nextMilestone && (
                    <div className={styles.statSub}>
                      {nextMilestone.percentOfSupply}% Burn ({formatNumber(nextMilestone.burnAmount * 1e6)} tokens)
                    </div>
                  )}
                </div>
              </div>
              
              {/* Milestone Burns Table */}
              <div className={styles.historyTable}>
                <table>
                  <thead>
                    <tr>
                      <th>MILESTONE</th>
                      <th>BURNED</th>
                      <th>TX</th>
                      <th>DATE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {milestoneBurns.length > 0 ? (
                      milestoneBurns.map((burn, idx) => (
                        <tr key={idx}>
                          <td>{formatMarketCap(burn.milestoneTarget)}</td>
                          <td>{formatNumber(burn.burnAmount)}</td>
                          <td>
                            <a 
                              href={`https://solscan.io/tx/${burn.txSignature}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={styles.txLink}
                            >
                              {shortenTx(burn.txSignature)}
                            </a>
                          </td>
                          <td>{formatDate(burn.timestamp)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} style={{ textAlign: 'center', opacity: 0.5 }}>
                          No milestone burns yet
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <>
              <div className={styles.metricRow}>
                <div className={styles.metricLabel}>Automated Buyback & Burn</div>
                <div className={styles.liveIndicator}>
                  <span className={styles.liveDot}></span>
                  <span>LIVE</span>
                </div>
              </div>

              {/* Buyback Stats Grid */}
              <div className={styles.burnStatsGrid}>
                <div className={styles.statCard}>
                  <div className={styles.statLabel}>Automated Burns (24h)</div>
                  <div className={styles.statValue}>{formatNumber(burnStats?.burns24h || 0)}</div>
                  <div className={styles.statSub}>+{((burnStats?.burns24h || 0) / 1e6 / 1000000000 * 100).toFixed(2)}% of supply</div>
                </div>
                <div className={styles.statCard}>
                  <div className={styles.statLabel}>Total Buyback Burns</div>
                  <div className={styles.statValue}>{formatNumber(burnStats?.buybackBurned || 0)}</div>
                </div>
                <div className={styles.statCard}>
                  <div className={styles.statLabel}>SOL Used for Buybacks</div>
                  <div className={styles.statValue}>{(burnStats?.totalSolSpent || 0).toFixed(2)} SOL</div>
                </div>
                <div className={styles.statCard}>
                  <div className={styles.statLabel}>Next Burn In</div>
                  <div className={`${styles.statValue} ${styles.highlight}`}>
                    <BurnCountdown />
                  </div>
                  <div className={styles.statSub}>15 min cycle</div>
                </div>
              </div>
              
              {/* Buyback Burns Table */}
              <div className={styles.historyTable}>
                <table>
                  <thead>
                    <tr>
                      <th>TIME</th>
                      <th>TX</th>
                      <th>SOL SPENT</th>
                      <th>BURNED</th>
                    </tr>
                  </thead>
                  <tbody>
                    {buybackBurns.length > 0 ? (
                      buybackBurns.map((burn, idx) => (
                        <tr key={idx}>
                          <td>{formatDate(burn.timestamp)}</td>
                          <td>
                            <a 
                              href={`https://solscan.io/tx/${burn.txSignature}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={styles.txLink}
                            >
                              {shortenTx(burn.txSignature)}
                            </a>
                          </td>
                          <td>{burn.solSpent?.toFixed(4) || '0'} SOL</td>
                          <td className={styles.burnAmount}>{formatNumber(burn.burnAmount)} INFERNO</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} style={{ textAlign: 'center', opacity: 0.5 }}>
                          No buyback burns yet
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </section>

      {/* THE INFERNO PROTOCOL Section */}
      <section className="section" id="protocol">
        <h2 className="section-title">THE INFERNO PROTOCOL</h2>
        <div className={styles.protocolMechanism}>
          {/* Flow Steps */}
          <div className={styles.stepsContainer}>
            <div className={styles.timeline}></div>
            
            <div className={styles.step}>
              <div className={styles.stepIcon}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline>
                  <polyline points="17 6 23 6 23 12"></polyline>
                </svg>
              </div>
              <div className={styles.stepTitle}>Volume</div>
              <div className={styles.stepDescription}>Trading generates volume and fees</div>
            </div>
            
            <div className={styles.step}>
              <div className={styles.stepIcon}>
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M6 3H18L21 8L12 21L3 8L6 3Z"/>
                  <path d="M6 8L12 21L18 8" fill="#ff8c00"/>
                  <path d="M6 3L12 8L18 3" fill="#ffcc00"/>
                </svg>
              </div>
              <div className={styles.stepTitle}>Collect</div>
              <div className={styles.stepDescription}>Creator rewards accumulate in SOL</div>
            </div>
            
            <div className={styles.step}>
              <div className={styles.stepIcon}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M23 4V10H17"/>
                  <path d="M20.49 15A9 9 0 1 1 5.64 5.64L23 10"/>
                </svg>
              </div>
              <div className={styles.stepTitle}>Buyback</div>
              <div className={styles.stepDescription}>SOL rewards buy $INFERNO tokens</div>
            </div>
            
            <div className={styles.step}>
              <div className={`${styles.stepIcon} ${styles.active}`}>
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C8 6 8 12 12 16C16 12 16 6 12 2Z"/>
                  <path d="M8 16C6 18 6 20 8 22C10 20 10 18 8 16Z" fill="#ff8c00"/>
                  <path d="M16 16C18 18 18 20 16 22C14 20 14 18 16 16Z" fill="#ff8c00"/>
                </svg>
              </div>
              <div className={styles.stepTitleActive}>Burn</div>
              <div className={styles.stepDescription}>Tokens permanently burned</div>
            </div>
            
            <div className={styles.step}>
              <div className={styles.stepIcon}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 20V10"/>
                  <path d="M12 20V4"/>
                  <path d="M6 20V14"/>
                </svg>
              </div>
              <div className={styles.stepTitle}>Growth</div>
              <div className={styles.stepDescription}>Market cap increases</div>
            </div>
            
            <div className={styles.step}>
              <div className={styles.stepIcon}>
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                </svg>
              </div>
              <div className={styles.stepTitle}>Milestones</div>
              <div className={styles.stepDescription}>Trigger major burns</div>
            </div>
          </div>
          
          {/* Mechanism Description */}
          <div className={styles.mechanismDescription}>
            <p>
              The INFERNO Protocol features <strong>dual burn mechanisms</strong> for maximum deflationary pressure:
            </p>
            
            <div className={`${styles.featureBox} ${styles.primary}`}>
              <span className={styles.burnFeature}>1️⃣ Automated Buyback & Burn:</span> Leverages pump.fun's creator revenue sharing to fuel a perpetual burn cycle. Every trade generates rewards that are automatically claimed, used to buy back tokens, and then burned—creating an unstoppable deflationary loop.
            </div>
            
            <div className={`${styles.featureBox} ${styles.secondary}`}>
              <span className={styles.burnFeature}>2️⃣ Milestone Burns:</span> Major token burns are triggered when specific market cap thresholds are reached, from $100K to $100M. These milestone burns will ultimately consume 25% of the total supply, creating significant supply shocks as the token grows.
            </div>
          </div>
        </div>
      </section>

      {/* Tokenomics Section - v1 Style with Icons */}
      <section className="section" id="tokenomics">
        <h2 className="section-title">TOKENOMICS</h2>
        <div className={styles.tokenomicsGridV1}>
          {/* 1B Fixed Supply */}
          <div className={styles.tokenomicsCardV1}>
            <div className={styles.tokenomicsIconV1}>
              <svg viewBox="0 0 24 24" fill="none" stroke="#ff4500" strokeWidth="2">
                <circle cx="11" cy="11" r="8"/>
                <path d="M21 21L16.65 16.65"/>
              </svg>
            </div>
            <div className={styles.tokenomicsTitleV1}>1B Fixed Supply</div>
            <div className={styles.tokenomicsDescV1}>
              Capped total supply with no minting capability - only burns.
            </div>
          </div>

          {/* 25% Burn Wallet */}
          <div className={styles.tokenomicsCardV1}>
            <div className={styles.tokenomicsIconV1}>
              <svg viewBox="0 0 24 24" fill="#ff4500">
                <path d="M12 2C8 6 8 12 12 16C16 12 16 6 12 2Z"/>
                <path d="M8 14C6 16 6 18 8 20C10 18 10 16 8 14Z" fill="#ff8c00"/>
                <path d="M16 14C18 16 18 18 16 20C14 18 14 16 16 14Z" fill="#ff8c00"/>
              </svg>
            </div>
            <div className={styles.tokenomicsTitleV1}>25% Burn Wallet</div>
            <div className={styles.tokenomicsDescV1}>
              25% of tokens allocated to burn wallet for milestone unlocks.
            </div>
            <div className={styles.burnWalletAddress}>
              Creator Wallet: 9hJ5y72q4piDGatvM9bZw7p1NcQ1AYjkUiTbpXDi8Ett
            </div>
          </div>

          {/* Zero Tax */}
          <div className={styles.tokenomicsCardV1}>
            <div className={styles.tokenomicsIconV1}>
              <svg viewBox="0 0 24 24" fill="none" stroke="#ff4500" strokeWidth="2">
                <rect x="2" y="6" width="20" height="12" rx="2"/>
                <circle cx="12" cy="12" r="2"/>
                <path d="M6 12h.01M18 12h.01"/>
              </svg>
            </div>
            <div className={styles.tokenomicsTitleV1}>Zero Tax</div>
            <div className={styles.tokenomicsDescV1}>
              No transaction fees or taxes - pure trading experience.
            </div>
          </div>

          {/* Automated Burn Loop */}
          <div className={styles.tokenomicsCardV1}>
            <div className={styles.tokenomicsIconV1}>
              <svg viewBox="0 0 24 24" fill="none" stroke="#ff4500" strokeWidth="2.5">
                <path d="M12 12C16 8 20 8 20 12C20 16 16 16 12 12C8 16 4 16 4 12C4 8 8 8 12 12Z"/>
              </svg>
            </div>
            <div className={styles.tokenomicsTitleV1}>Automated Burn Loop</div>
            <div className={styles.tokenomicsDescV1}>
              Creator rewards automatically bought back and burned.
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className={styles.footer}>
        <div className={styles.footerContent}>
          <h2 className="section-title">JOIN THE INFERNO</h2>
          <p className={styles.followText}>Follow our socials to stay updated</p>
          <div className={styles.socialLinks}>
            <a href="https://twitter.com/Infernoburnsit" target="_blank" rel="noopener noreferrer" className={styles.socialLink}>𝕏</a>
          </div>
          <p className={styles.copyright}>© 2025 INFERNO Protocol. All rights reserved.</p>
          <p className={styles.disclaimer}>This website is not financial advice. $INFERNO has no intrinsic value.</p>
        </div>
      </footer>
    </main>
  );
}