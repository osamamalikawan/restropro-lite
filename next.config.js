/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: require('./scripts/app-version-env'), // web version + build, shown in the desktop sync popup
  // Service worker + manifest are hand-written in /public (see public/sw.js) rather than
  // relying on a build plugin, so there is no extra build-time dependency to keep working.
};
module.exports = nextConfig;
