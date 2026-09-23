// Netlify Function (v2) at /api/events: netlify/functions/events.mts. Needs `npm i -D @netlify/functions` for types.
// Secrets: Netlify → Site configuration → Environment variables (scope Functions, "Contains secret values").
import type { Config, Context } from '@netlify/functions';
import { handleRelay, type RelayEnv } from '../../src/tracking/server/relay';

export default (request: Request, context: Context) =>
  handleRelay(request, process.env as RelayEnv, (promise) => context.waitUntil(promise), {
    ip: context.ip,
    geo: {
      city: context.geo?.city,
      region: context.geo?.subdivision?.code,
      postalCode: context.geo?.postalCode,
      country: context.geo?.country?.code,
    },
  });

export const config: Config = { path: '/api/events' };
