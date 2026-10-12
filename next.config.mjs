/** @type {import('next').NextConfig} */
const nextConfig = {
  // Embedded Postgres used only in local dev (see src/lib/sql.ts); never bundled.
  serverExternalPackages: ['@electric-sql/pglite'],
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
        ],
      },
    ];
  },
};

export default nextConfig;
