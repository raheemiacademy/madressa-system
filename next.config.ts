import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: { serverActions: { bodySizeLimit: '25mb' } },
  serverExternalPackages: ['@node-rs/argon2'],
  async headers() {
    const common = [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'same-origin' },
      { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=()' }
    ];
    return [
      // Everything except the public application form refuses to be framed.
      { source: '/((?!apply).*)', headers: [...common, { key: 'X-Frame-Options', value: 'DENY' }, { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" }] },
      // The application form may be embedded on the school's own website (§5 embed code).
      { source: '/apply/:path*', headers: [...common, { key: 'Content-Security-Policy', value: 'frame-ancestors https:' }] },
      { source: '/apply', headers: [...common, { key: 'Content-Security-Policy', value: 'frame-ancestors https:' }] }
    ];
  }
};

export default nextConfig;
