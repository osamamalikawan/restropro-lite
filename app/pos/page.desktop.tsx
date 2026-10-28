'use client';
import { DesktopShell } from '@/components/desktop-shell';
import { useDesktopCtx } from '@/lib/desktop/context';
import { PosClient } from './pos-client';

// Same composition as the web page.tsx — sidebar + top bar around the POS (`withShell`) — with the
// session read from the device instead of a cookie. Replaces page.tsx in the desktop build.
function DesktopPos() {
  const ctx = useDesktopCtx();
  if (!ctx) return null;
  return <PosClient withShell restaurantId={ctx.restaurantId} restaurantName={ctx.restaurantName} cashierName={ctx.employeeName} />;
}

export default function PosPage() {
  return (
    <DesktopShell>
      <DesktopPos />
    </DesktopShell>
  );
}
