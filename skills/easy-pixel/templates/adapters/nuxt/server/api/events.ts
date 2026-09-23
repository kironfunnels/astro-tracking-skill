// Nuxt/Nitro relay: server/api/events.ts → /api/events (any Nitro preset: Node, Vercel, Netlify, Cloudflare).
// Adjust the import to where core/tracking was copied (server code cannot use the app "~" alias in Nuxt 4;
// a relative path or #shared/tracking/... when the code lives in shared/).
// Secrets: environment variables of the host; on Cloudflare presets they come from event.context.cloudflare.env.
import { handleRelay, type RelayEnv } from '../../tracking/server/relay';

export default defineEventHandler((event) => {
  const cloudflare = (event.context as { cloudflare?: { env?: RelayEnv; request?: { cf?: Record<string, string> } } }).cloudflare;
  const cf = cloudflare?.request?.cf;
  return handleRelay(
    toWebRequest(event),
    cloudflare?.env ?? (process.env as RelayEnv),
    (promise) => event.waitUntil(promise),
    cf ? { geo: { city: cf.city, region: cf.regionCode, postalCode: cf.postalCode, country: cf.country } } : undefined,
  );
});
