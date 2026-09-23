// SvelteKit relay: src/routes/api/events/+server.ts. Works with adapter-cloudflare (platform.env/ctx/cf),
// adapter-vercel, adapter-netlify and adapter-node ($env/dynamic/private).
import { env as privateEnv } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import { handleRelay, type RelayEnv } from '$lib/tracking/server/relay';

const handler: RequestHandler = ({ request, platform }) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cloudflare = platform as any;
  const cf = cloudflare?.cf;
  return handleRelay(
    request,
    (cloudflare?.env ?? privateEnv) as RelayEnv,
    cloudflare?.ctx ? (promise) => cloudflare.ctx.waitUntil(promise) : undefined,
    cf ? { geo: { city: cf.city, region: cf.regionCode, postalCode: cf.postalCode, country: cf.country } } : undefined,
  );
};

export const POST = handler;
export const OPTIONS = handler;
