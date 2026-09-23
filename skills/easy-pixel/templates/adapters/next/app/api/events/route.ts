// Next.js App Router relay: app/api/events/route.ts (or src/app/...). Works on Vercel, Node and OpenNext/Cloudflare.
// after() (Next.js 15.1+) sends to the platforms once the response is out; on older versions pass
// `waitUntil` from @vercel/functions (Vercel) or nothing (the relay then awaits before answering).
// Secrets: environment variables of the host (Vercel → Settings → Environment Variables, marked Sensitive).
import { after } from 'next/server';
import { handleRelay, type RelayEnv } from '../../../tracking/server/relay';

const env = process.env as RelayEnv;

export function POST(request: Request) {
  return handleRelay(request, env, (promise) => after(promise));
}

export function OPTIONS(request: Request) {
  return handleRelay(request, env);
}
