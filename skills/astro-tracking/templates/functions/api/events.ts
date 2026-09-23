// Cloudflare Pages Function (static Astro site on Cloudflare Pages): POST /api/events.
// Secrets: Pages project → Settings → Variables and Secrets (type "Secret"), then redeploy. See references/cloudflare.md.
import { handleRelay, type RelayEnv } from '../../src/tracking/server/relay';

interface PagesContext {
  request: Request;
  env: RelayEnv;
  waitUntil(promise: Promise<unknown>): void;
}

export const onRequest = ({ request, env, waitUntil }: PagesContext) => handleRelay(request, env, waitUntil);
