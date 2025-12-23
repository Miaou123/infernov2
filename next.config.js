/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable experimental features if needed
  experimental: {
    serverComponentsExternalPackages: ['better-sqlite3']
  },
  
  // Environment variables available on client
  env: {
    NEXT_PUBLIC_TOKEN_NAME: process.env.TOKEN_NAME || '$INFERNO',
    NEXT_PUBLIC_INITIAL_SUPPLY: process.env.INITIAL_SUPPLY || '1000000000'
  },
  
  // Webpack configuration for native modules
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals.push('better-sqlite3');
    }
    return config;
  }
};

module.exports = nextConfig;
