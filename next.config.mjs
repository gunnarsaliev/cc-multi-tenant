import { withPayload } from '@payloadcms/next/withPayload'

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Your Next.js config here
  async rewrites() {
    return [
      {
        source: '/((?!admin|api))tenant-domains/:path*',
        destination: '/tenant-domains/:tenant/:path*',
        has: [
          {
            type: 'host',
            value: '(?<tenant>.*)',
          },
        ],
      },
    ]
  },
}

// eve needs Node 24 and an AI model, so it stays off until EVE_ENABLED=true.
const withAgents =
  process.env.EVE_ENABLED === 'true' ? (await import('eve/next')).withEve : (config) => config

export default withAgents(withPayload(nextConfig))
