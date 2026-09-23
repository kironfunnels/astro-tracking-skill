'use client';
// Next.js (App Router). Render <Tracking /> once inside <body> in app/layout.tsx.
// Copy core/tracking to src/tracking (or tracking/ without src) and set `spa: true` in tracking/config.ts:
// client-side navigation does not reload the page, so the runtime sends PageView on each route change.
import { useEffect } from 'react';

export default function Tracking() {
  useEffect(() => {
    // Loaded once in the browser; the module starts itself and survives route changes.
    import('../tracking/client');
  }, []);
  return null;
}
