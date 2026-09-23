// Cloudflare Pages Function for any static site on Cloudflare Pages (Astro without adapter, Vite SPA, Next export,
// plain HTML): POST /api/events. Adjust the import if core/tracking is not in src/tracking.
// Secrets: Pages project → Settings → Variables and Secrets (type "Secret"), then redeploy. See references/cloudflare.md.
import { handleRelay, type RelayEnv } from '../../src/tracking/server/relay';

interface PagesContext {
  request: Request;
  env: RelayEnv;
  waitUntil(promise: Promise<unknown>): void;
}

export const onRequest = ({ request, env, waitUntil }: PagesContext) => handleRelay(request, env, waitUntil);
