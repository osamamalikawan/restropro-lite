// lib/platform.ts
export const isTauri = () =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;