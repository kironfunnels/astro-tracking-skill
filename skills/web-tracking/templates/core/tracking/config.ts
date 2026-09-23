// Tracking configuration shared by the browser runtime and the server relay (any stack: Astro, Next.js, Nuxt,
// SvelteKit, SPA, static/WordPress bundle).
// IDs below are public (they end up in the page source anyway). Access tokens NEVER go here:
// they live only as encrypted Cloudflare secrets (see references/cloudflare.md).
// Leave an ID empty to disable that platform.
import type { EventName } from './events';

export const tracking = {
  /** Hostnames allowed to post to the relay and to appear in event_source_url. Include previews and localhost for tests. */
  hosts: ['example.com', 'www.example.com', 'example.pages.dev', 'localhost', '127.0.0.1'],
  /** Other domains (checkout, app, form host) whose links should receive the persisted URL parameters. */
  decorateDomains: [] as string[],
  /** Relay endpoint: same-origin path ('/api/events') or absolute URL of a relay on a subdomain
   *  ('https://track.example.com/events'). Empty string = browser-only tracking. */
  endpoint: '/api/events',
  /** true for client-side routed apps (Next.js, Nuxt, SvelteKit, React/Vue SPA): route changes send PageView. */
  spa: false,
  /** 'none' loads everything on page load. 'opt-in' waits for window.tracking.consent(true) (Google loads with denied defaults). */
  consent: 'none' as 'none' | 'opt-in',
  /** Country calling code used when a phone number arrives without one. */
  defaultCountryCode: '55',
  /** Scroll depth thresholds (%) sent as the custom event "Scroll". Empty array disables it. */
  scroll: [] as number[],
  /** Custom (non-standard) event names that may also be relayed to the Meta Conversions API. */
  serverCustomEvents: [] as string[],
  /** Standard events that stay browser-only, e.g. ['PageView'] to cut relay calls on high-traffic sites. */
  browserOnlyEvents: [] as string[],

  meta: { pixelId: '', names: {} as Partial<Record<EventName, string | false>> },
  ga4: { measurementId: '', linkerDomains: [] as string[], names: {} as Partial<Record<EventName, string | false>> },
  /** conversions maps a canonical event to its "AW-XXXXXXXXX/label" send_to. */
  googleAds: { id: '', conversions: {} as Partial<Record<EventName, string>> },
  /** Only when the client insists on keeping a GTM container. Do not configure the same pixel in GTM and here. */
  gtm: { containerId: '' },
  tiktok: { pixelId: '', names: {} as Partial<Record<EventName, string | false>> },
  pinterest: { tagId: '', adAccountId: '', names: {} as Partial<Record<EventName, string | false>> },
  microsoft: { uetTagId: '', names: {} as Partial<Record<EventName, string | false>> },
  /** conversions maps a canonical event to the numeric conversion_id created in Campaign Manager. */
  linkedin: { partnerId: '', conversions: {} as Partial<Record<EventName, number>> },
};

export type TrackingConfig = typeof tracking;
