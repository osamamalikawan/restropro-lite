/** Visibility-aware polling. Every poll is a Vercel function invocation, so a tab nobody is looking at should poll
 *  slowly (hiddenMs) or not at all (hiddenMs: null). When the tab becomes visible again it refreshes straight away.
 *  Returns a stop function for the effect cleanup. */
export function startPolling(fn: () => void | Promise<void>, opts: { visibleMs: number; hiddenMs: number | null }): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  let last = Date.now();

  const delay = () => (document.hidden ? opts.hiddenMs : opts.visibleMs);

  function schedule() {
    if (stopped) return;
    const ms = delay();
    if (ms === null) {
      timer = null; // paused until the tab is visible again
      return;
    }
    timer = setTimeout(async () => {
      last = Date.now();
      try {
        await fn();
      } finally {
        schedule();
      }
    }, ms);
  }

  function onVis() {
    if (stopped) return;
    if (timer) clearTimeout(timer);
    timer = null;
    if (!document.hidden && Date.now() - last > 3000) {
      last = Date.now();
      Promise.resolve(fn()).finally(schedule);
    } else {
      schedule();
    }
  }

  document.addEventListener("visibilitychange", onVis);
  schedule();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    document.removeEventListener("visibilitychange", onVis);
  };
}
