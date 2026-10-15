'use client';
import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

/** Desktop app self-update: asks the shell whether a newer version exists and installs it on request
 *  (the shell restarts itself afterwards). Shown inside the sync status popup. */
export function ShellUpdateCheck() {
  const [status, setStatus] = useState<'idle' | 'checking' | 'upToDate' | 'available' | 'installing' | 'error'>('idle');
  const [version, setVersion] = useState<string | null>(null);
  const [error, setError] = useState('');

  // An older shell build does not have the update commands at all - say that instead of a raw error.
  const readable = (err: unknown, fallback: string) =>
    typeof err === 'string' ? (/not found|unknown command|not allowed/i.test(err) ? "This version of the app can't update itself yet — install the latest version manually." : err) : fallback;

  async function checkNow() {
    setStatus('checking');
    setError('');
    try {
      const v = await invoke<string | null>('check_for_shell_update');
      if (v) {
        setVersion(v);
        setStatus('available');
      } else {
        setStatus('upToDate');
      }
    } catch (err) {
      setError(readable(err, 'Could not check for updates'));
      setStatus('error');
    }
  }

  async function installNow() {
    setStatus('installing');
    try {
      await invoke('install_shell_update');
      // app restarts itself on success — nothing further to do here
    } catch (err) {
      setError(readable(err, 'Update failed'));
      setStatus('error');
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
      {status === 'idle' && (
        <button onClick={checkNow} className="underline">Check for updates</button>
      )}
      {status === 'checking' && <span>Checking…</span>}
      {status === 'upToDate' && (
        <>
          <span>You&apos;re on the latest version</span>
          <button onClick={checkNow} className="underline">Check again</button>
        </>
      )}
      {status === 'available' && (
        <>
          <span>Version {version} available</span>
          <button onClick={installNow} className="rounded bg-chili-500 text-white px-2 py-1">
            Install and restart
          </button>
        </>
      )}
      {status === 'installing' && <span>Installing — app will restart…</span>}
      {status === 'error' && (
        <>
          <span className="break-words text-crimson-400">{error}</span>
          <button onClick={checkNow} className="underline">Retry</button>
        </>
      )}
    </div>
  );
}
