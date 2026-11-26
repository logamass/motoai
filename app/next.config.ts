import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  transpilePackages: [
    '@motoai/core',
    '@motoai/agent',
    '@motoai/channel',
    '@motoai/mod-catalog',
    '@motoai/mod-pricing',
    '@motoai/mod-ingestion',
    '@motoai/mod-customers',
    '@motoai/mod-leads',
    '@motoai/mod-handoff',
    '@motoai/mod-analytics',
  ],
  webpack: (config) => {
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.mjs': ['.mts', '.mjs'],
      '.cjs': ['.cts', '.cjs'],
    }
    return config
  },
}

export default nextConfig
