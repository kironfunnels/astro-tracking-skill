// Astro endpoint for projects deployed to Cloudflare Workers with @astrojs/cloudflare (Astro 6+).
// Copy to src/pages/api/events.ts ONLY in that setup; static sites on Pages use functions/api/events.ts instead.
// Secrets: Workers project → Settings → Variables and Secrets, or `npx wrangler secret put META_CAPI_TOKEN`.
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { handleRelay, type RelayEnv } from '../../tracking/server/relay';

export const prerender = false;

export const ALL: APIRoute = ({ request, locals }) => {
  const context = (locals as { cfContext?: { waitUntil(promise: Promise<unknown>): void } }).cfContext;
  return handleRelay(request, env as RelayEnv, (promise) => (context ? context.waitUntil(promise) : void promise));
};
