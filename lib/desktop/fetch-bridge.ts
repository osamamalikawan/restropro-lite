import { invoke } from "@tauri-apps/api/core";

/** Desktop app only. The bundled screens call `fetch("/api/...")` exactly like the web app, but
 *  there is no web server behind the desktop bundle (it is a static export served from the app
 *  itself). This replaces window.fetch for same-origin /api/ calls with a Tauri command that
 *  forwards the request to the cloud server using the activated device's credentials, and turns
 *  the answer back into a normal Response — so every existing screen works without changes.
 *  Offline, the command fails and the caller sees an ordinary network error (TypeError). */
const NO_BODY_STATUSES = new Set([101, 204, 205, 304]);

type ApiReply = { status: number; content_type: string | null; body: string };

export function installDesktopFetch() {
  if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) return;
  const w = window as unknown as { __rpFetchBridge?: boolean };
  if (w.__rpFetchBridge) return;
  w.__rpFetchBridge = true;

  const original = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const href = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(href, window.location.href);
    if (url.origin !== window.location.origin || !url.pathname.startsWith("/api/")) {
      return original(input, init);
    }

    const request = input instanceof Request ? input : null;
    const method = (init?.method ?? request?.method ?? "GET").toUpperCase();
    const headers = new Headers(init?.headers ?? request?.headers);
    let body: string | null = null;
    const rawBody = init?.body ?? (request && method !== "GET" && method !== "HEAD" ? await request.clone().text() : undefined);
    if (rawBody != null) {
      if (typeof rawBody !== "string") {
        // FormData / Blob (image upload) can't cross the bridge yet — fail like a network error.
        throw new TypeError("Uploading files is not supported in the desktop app yet");
      }
      body = rawBody;
    }

    let reply: ApiReply;
    try {
      reply = await invoke<ApiReply>("api_request", {
        method,
        path: url.pathname + url.search,
        body,
        contentType: headers.get("content-type"),
      });
    } catch (e) {
      throw new TypeError(typeof e === "string" ? e : "Network request failed");
    }

    return new Response(NO_BODY_STATUSES.has(reply.status) ? null : reply.body, {
      status: reply.status,
      headers: reply.content_type ? { "content-type": reply.content_type } : undefined,
    });
  };
}
