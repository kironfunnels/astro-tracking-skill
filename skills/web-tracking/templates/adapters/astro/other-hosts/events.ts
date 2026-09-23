// Astro endpoint for on-demand Astro sites on Vercel, Netlify or Node (@astrojs/vercel, @astrojs/netlify, @astrojs/node).
// Copy to src/pages/api/events.ts. On Cloudflare use ../cloudflare-workers/events.ts; a fully static site on
// Cloudflare Pages uses adapters/cloudflare-pages instead. Secrets come from the host's environment variables.
import type { APIRoute } from 'astro';
import { handleRelay, type RelayEnv } from '../../tracking/server/relay';

export const prerender = false;

export const ALL: APIRoute = ({ request }) => handleRelay(request, process.env as RelayEnv);
