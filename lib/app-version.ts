/** Version of the WEB app this screen is running: package.json "version" + the short commit it was built from,
 *  stamped in at build time by next.config.js / next.config.desktop.js (so the Vercel site and the bundled
 *  desktop copy each report their own build). The DESKTOP shell version is separate - it comes from the
 *  Tauri app itself (see DesktopSyncBar). */
export const WEB_VERSION = process.env.NEXT_PUBLIC_WEB_VERSION || "unknown";
export const WEB_BUILD = process.env.NEXT_PUBLIC_WEB_BUILD || "";
