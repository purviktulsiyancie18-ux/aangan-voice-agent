/** @type {import('next').NextConfig} */
const nextConfig = {
  // Gemini reads knowledge/*.md at runtime — make sure Vercel ships them.
  outputFileTracingIncludes: {
    '/api/**/*': ['./knowledge/**/*', './db/**/*'],
    '/': ['./knowledge/**/*', './db/**/*'],
  },
  serverExternalPackages: ['@electric-sql/pglite'],
};
export default nextConfig;
