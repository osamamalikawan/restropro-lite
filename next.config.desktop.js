/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: require('./scripts/app-version-env'), // web version + build, shown in the desktop sync popup
  output: 'export',
  images: { unoptimized: true },
};
module.exports = nextConfig;