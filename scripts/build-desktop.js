// scripts/build-desktop.js
//
// Builds a static export of the web app for bundling into the Tauri desktop shell.
//
// The desktop bundle has no server, so everything that needs one is swapped out for the
// duration of the build and restored afterwards (the web/Vercel build is never affected):
//   - app/api and app/signup are removed (API routes / Server Actions can't be exported).
//   - Every `<name>.desktop.tsx` next to a `<name>.tsx` (page.desktop.tsx, layout.desktop.tsx)
//     replaces it. Those are client components that read the signed-in cashier from the device
//     instead of a cookie; the screens they render are the SAME *-client.tsx components as the
//     web app, so the UI is identical. Their /api/* calls go through the desktop fetch bridge.
//   - Any page.tsx under app/(restaurant) that has no desktop variant is excluded, so a new web
//     page can't break the desktop export (add a page.desktop.tsx to include it).

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const webConfigBackup = '.next.config.web.backup.js';
const BACKUP_SUFFIX = '.webbak';

const apiDir = 'app/api';
const apiBackup = '.api-backup';
const signupDir = 'app/signup';
const signupBackup = '.signup-backup';

const moved = []; // [from, to] pairs to undo, in order
const copied = []; // files created from *.desktop.tsx, deleted on restore

function moveAway(from, to) {
  if (!fs.existsSync(from)) return false;
  fs.renameSync(from, to);
  moved.push([from, to]);
  return true;
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function swapDesktopVariants() {
  const files = walk('app');
  const desktopFiles = files.filter((f) => /\.desktop\.tsx$/.test(f));
  const swapped = new Set();

  for (const desktop of desktopFiles) {
    const real = desktop.replace(/\.desktop\.tsx$/, '.tsx');
    if (fs.existsSync(real)) moveAway(real, real + BACKUP_SUFFIX);
    fs.copyFileSync(desktop, real);
    copied.push(real);
    swapped.add(real);
  }

  // Server-only pages of the dashboard section with no desktop variant: leave them out.
  for (const f of files) {
    const norm = f.split(path.sep).join('/');
    if (norm.startsWith('app/(restaurant)/') && /\/page\.tsx$/.test(norm) && !swapped.has(f)) {
      console.warn(`Skipping ${norm}: no page.desktop.tsx, so it is left out of the desktop app.`);
      moveAway(f, f + BACKUP_SUFFIX);
    }
  }
  console.log(`Swapped in ${desktopFiles.length} desktop page/layout variants.`);
}

function restoreAll() {
  for (const f of copied) {
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }
  for (const [from, to] of moved.slice().reverse()) {
    if (fs.existsSync(to)) fs.renameSync(to, from);
  }
  if (fs.existsSync(webConfigBackup)) {
    fs.copyFileSync(webConfigBackup, 'next.config.js');
    fs.unlinkSync(webConfigBackup);
  }
}

// --- swap in desktop config -------------------------------------------------
fs.copyFileSync('next.config.js', webConfigBackup);
fs.copyFileSync('next.config.desktop.js', 'next.config.js');

try {
  moveAway(apiDir, apiBackup);
  moveAway(signupDir, signupBackup);
  swapDesktopVariants();

  // Leftover .next/ from a previous dev or web build still references files we just moved out,
  // which makes Next's type checker fail resolving modules that no longer exist.
  if (fs.existsSync('.next')) fs.rmSync('.next', { recursive: true, force: true });

  execSync('next build', { stdio: 'inherit' });
  console.log('Desktop static export built at ./out');
} finally {
  restoreAll();
}
