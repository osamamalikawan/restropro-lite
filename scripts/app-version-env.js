// Shared by next.config.js and next.config.desktop.js: the values behind NEXT_PUBLIC_WEB_VERSION / NEXT_PUBLIC_WEB_BUILD
// (shown in the desktop sync popup). Version = package.json; build = the commit being built (Vercel provides it, otherwise git).
const { execSync } = require('child_process');

function webBuild() {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA;
  if (sha) return sha.slice(0, 7);
  try {
    return execSync('git rev-parse --short=7 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return '';
  }
}

module.exports = {
  NEXT_PUBLIC_WEB_VERSION: require('../package.json').version,
  NEXT_PUBLIC_WEB_BUILD: webBuild(),
};
