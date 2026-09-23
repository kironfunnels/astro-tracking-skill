// Vercel Function for projects that are NOT Next.js (Vite SPA, static HTML, Astro static on Vercel...): api/events.ts.
// Needs `npm i @vercel/functions`. Secrets: Vercel → Project → Settings → Environment Variables (Sensitive).
import { waitUntil } from '@vercel/functions';
import { handleRelay, type RelayEnv } from '../src/tracking/server/relay';

const env = process.env as RelayEnv;

export function POST(request: Request) {
  return handleRelay(request, env, waitUntil);
}

export function OPTIONS(request: Request) {
  return handleRelay(request, env);
}
