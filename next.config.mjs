/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: [
    'puppeteer',
    'puppeteer-screen-recorder',
    '@ffmpeg-installer/ffmpeg',
    '@browserbasehq/stagehand',
    'sharp',
    '@techstark/opencv-js',
  ],
  images: {
    unoptimized: true,
  },
  async headers() {
    const securityHeaders = [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      ...(process.env.NODE_ENV === 'production'
        ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' }]
        : []),
    ]
    return [{ source: '/:path*', headers: securityHeaders }]
  },
  async rewrites() {
    // Local simulator proxies are development-only. Never expose loopback services
    // through production or preview deployments.
    if (process.env.NODE_ENV !== 'development') return []
    return [
      {
        source: '/proxy/:port',
        destination: 'http://127.0.0.1::port',
      },
      {
        source: '/proxy/:port/:path*',
        destination: 'http://127.0.0.1::port/:path*',
      },
      {
        source: '/expo-app',
        destination: 'http://127.0.0.1:8082',
      },
      {
        source: '/expo-app/:path*',
        destination: 'http://127.0.0.1:8082/:path*',
      },
      {
        source: '/index.bundle',
        destination: 'http://127.0.0.1:8082/index.bundle',
      },
      {
        source: '/_expo/:path*',
        destination: 'http://127.0.0.1:8082/_expo/:path*',
      },
      {
        source: '/assets/:path*',
        destination: 'http://127.0.0.1:8082/assets/:path*',
      },
    ]
  },
}

export default nextConfig

