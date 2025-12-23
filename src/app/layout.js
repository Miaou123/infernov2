import './globals.css';

export const metadata = {
  title: '$INFERNO - Burn Protocol Activated',
  description: 'A deflationary token on Solana with automatic buyback and milestone-based burns. Watch the supply shrink in real-time.',
  keywords: ['Solana', 'Token', 'Deflationary', 'Burn', 'Crypto', 'DeFi', 'INFERNO'],
  openGraph: {
    title: '$INFERNO - Burn Protocol Activated',
    description: 'Deflationary token with automatic buyback and milestone burns on Solana',
    type: 'website',
  },
  icons: {
    icon: [
      { url: '/images/favicon.ico' },
      { url: '/images/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/images/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
    ],
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* v1 Fonts: Iceland for logo text, Rajdhani for body */}
        <link 
          href="https://fonts.googleapis.com/css2?family=Iceland&family=Rajdhani:wght@300;400;500;600;700&family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" 
          rel="stylesheet" 
        />
      </head>
      <body>
        <div className="fire-bg" />
        {children}
      </body>
    </html>
  );
}