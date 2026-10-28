import type { Metadata } from "next";
import { Fraunces, Public_Sans, IBM_Plex_Mono, Noto_Naskh_Arabic } from "next/font/google";
import "./globals.css";
import { DesktopBridge } from "@/components/desktop-bridge";

const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-fraunces",
});
const publicSans = Public_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-public-sans",
});
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
});
// Urdu: used on screen (as the fallback for Urdu letters) and by lib/posPrint.ts when it draws Urdu lines for the thermal printer.
const naskh = Noto_Naskh_Arabic({
  subsets: ["arabic"],
  variable: "--font-urdu",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Restro Pro",
  description: "Run your restaurant. Smarter.",
  manifest: "/manifest.json",
};

export const viewport = {
  themeColor: "#161310",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
        {/* Applies the saved theme before first paint — avoids a flash of the wrong theme */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var saved = localStorage.getItem('rp_theme');
                  document.documentElement.setAttribute('data-theme', saved === 'light' ? 'light' : 'dark');
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body className={`${fraunces.variable} ${publicSans.variable} ${plexMono.variable} ${naskh.variable} font-body`}>
        <DesktopBridge />
        {children}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', () => {
                  navigator.serviceWorker.register('/sw.js').catch(console.error);
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
