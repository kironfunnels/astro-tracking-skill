// Nuxt/Nitro relay: server/api/events.ts → /api/events (any Nitro preset: Node, Vercel, Netlify, Cloudflare).
// Adjust the import to where core/tracking was copied (server code cannot use the app "~" alias in Nuxt 4;
// a relative path or #shared/tracking/... when the code lives in shared/).
// Secrets: environment variables of the host. On Cloudflare presets, read event.context.cloudflare.env instead.
import { handleRelay, type RelayEnv } from '../../tracking/server/relay';

export default defineEventHandler((event) =>
  handleRelay(toWebRequest(event), process.env as RelayEnv, (promise) => event.waitUntil(promise)),
);
