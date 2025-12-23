'use client';

import { useState } from 'react';
import styles from './Header.module.css';

export default function Header({ onRefresh }) {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    if (onRefresh) {
      await onRefresh();
    }
    setTimeout(() => setIsRefreshing(false), 1000);
  };

  return (
    <header className={styles.header}>
      <div className={styles.logoSmall}>
        <img 
          src="/images/logo.png" 
          width={30} 
          height={30} 
          alt="INFERNO Logo" 
          className={styles.logoGlow}
        />
      </div>
      
      <nav className={styles.navMenu}>
        <a href="#metrics" className={styles.navItem}>Metrics</a>
        <a href="#protocol" className={styles.navItem}>Protocol</a>
        <a href="#tokenomics" className={styles.navItem}>Tokenomics</a>
      </nav>
      
      <button 
        className={`${styles.refreshButton} ${isRefreshing ? styles.refreshing : ''}`}
        onClick={handleRefresh}
      >
        <span className={styles.refreshIcon}>↻</span>
        <span className={styles.refreshText}>Refresh Data</span>
        <span className={styles.buttonFlame}></span>
      </button>
    </header>
  );
}