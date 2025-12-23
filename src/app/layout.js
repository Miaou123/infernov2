import './globals.css';

export const metadata = {
  title: '$INFERNO - Deflationary Token on Solana',
  description: 'A deflationary token with automatic buyback and milestone-based burns on the Solana blockchain.',
  keywords: ['Solana', 'Token', 'Deflationary', 'Burn', 'Crypto', 'DeFi'],
  openGraph: {
    title: '$INFERNO Token',
    description: 'Deflationary token with automatic buyback and milestone burns',
    type: 'website',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link 
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" 
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
