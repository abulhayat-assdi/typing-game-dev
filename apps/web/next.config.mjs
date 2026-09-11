/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  // Workers-safe: no Node-only server features in M1.
  // Image optimization stays disabled until an R2-backed loader lands (M3).
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
