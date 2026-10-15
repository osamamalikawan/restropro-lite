// lib/secureStore.ts
import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "./platform";

export async function secureSet(key: string, value: string) {
  if (!isTauri()) return; // no-op on web
  await invoke("secure_set", { key, value });
}

export async function secureGet(key: string): Promise<string | null> {
  if (!isTauri()) return null;
  return await invoke("secure_get", { key });
}

export async function secureDelete(key: string) {
  if (!isTauri()) return;
  await invoke("secure_delete", { key });
}