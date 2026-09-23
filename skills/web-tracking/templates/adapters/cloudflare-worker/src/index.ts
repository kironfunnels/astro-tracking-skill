// Standalone Cloudflare Worker relay, for sites whose host cannot run server code (WordPress, Elementor, Webflow,
// Wix custom code, plain HTML on any host). Copy core/tracking to src/tracking next to this file.
// Deploy on the SAME registrable domain so the browser sends _fbp/_fbc/_ttp cookies:
//   - a route on the site's zone:   example.com/api/events*   (site proxied by Cloudflare), or
//   - a custom domain subdomain:    track.example.com         (set tracking.endpoint to https://track.example.com/)
// Secrets: `npx wrangler secret put META_CAPI_TOKEN` or dashboard → Worker → Settings → Variables and Secrets.
import { handleRelay, type RelayEnv } from './tracking/server/relay';

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

export default {
  fetch(request: Request, env: RelayEnv, ctx: ExecutionContext) {
    return handleRelay(request, env, (promise) => ctx.waitUntil(promise));
  },
};
