import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // brand accents — same across both themes, matching the original prototype
        chili: { 300: "#F2A075", 400: "#E86B3E", 500: "#D9481F", 600: "#B8391A" },
        basil: { 400: "#5C9273", 500: "#3F6E52", 600: "#2E5A41" },
        turmeric: { 400: "#E0B662", 500: "#C99A3E" },
        crimson: { 400: "#D25861", 500: "#B7383F" },
        // theme-aware surface/text tokens — driven by the RGB-channel CSS variables in
        // globals.css. The `rgb(var(...) / <alpha-value>)` form is what makes opacity
        // modifiers like `bg-raised/50` work correctly (a plain hex CSS variable can't do this).
        canvas: "rgb(var(--bg-canvas) / <alpha-value>)",
        surface: "rgb(var(--bg-surface) / <alpha-value>)",
        raised: "rgb(var(--bg-raised) / <alpha-value>)",
        hover: "rgb(var(--bg-hover) / <alpha-value>)",
        line: "rgb(var(--line) / <alpha-value>)",
        "line-soft": "rgb(var(--line-soft) / <alpha-value>)",
        ink: {
          strong: "rgb(var(--ink-strong) / <alpha-value>)",
          mid: "rgb(var(--ink-mid) / <alpha-value>)",
          faint: "rgb(var(--ink-faint) / <alpha-value>)",
        },
      },
      fontFamily: {
        display: ["var(--font-fraunces)", "var(--font-urdu)", "serif"],
        body: ["var(--font-public-sans)", "var(--font-urdu)", "sans-serif"],
        mono: ["var(--font-plex-mono)", "var(--font-urdu)", "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;
