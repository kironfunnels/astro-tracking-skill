// TikTok Pixel. https://ads.tiktok.com/help/article/standard-events-parameters
// The relay sends the same event_id to the Events API; TikTok keeps the first event per id for 48 h.
import { tracking } from '../config';
import { platformName, toTikTok } from '../events';
import type { HashedIdentity } from '../identity';
import { loadScript, type BrowserPlatform } from './types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ttq = any;
declare global {
  interface Window { ttq?: Ttq; TiktokAnalyticsObject?: string }
}

// Readable version of TikTok's base code: a queue stub with the documented methods plus the events.js loader.
// If TikTok changes its base code, compare this with the snippet shown in Events Manager.
function install(pixelId: string) {
  window.TiktokAnalyticsObject = 'ttq';
  const ttq: Ttq = (window.ttq = window.ttq || []);
  ttq.methods = ['page', 'track', 'identify', 'instances', 'debug', 'on', 'off', 'once', 'ready', 'alias', 'group', 'enableCookie', 'disableCookie', 'holdConsent', 'revokeConsent', 'grantConsent'];
  ttq.setAndDefer = (target: Ttq, method: string) => {
    target[method] = (...args: unknown[]) => target.push([method, ...args]);
  };
  for (const method of ttq.methods) ttq.setAndDefer(ttq, method);
  ttq.instance = (id: string) => {
    const instance = ttq._i[id] || [];
    for (const method of ttq.methods) ttq.setAndDefer(instance, method);
    return instance;
  };
  ttq.load = (id: string, options?: Record<string, unknown>) => {
    const src = 'https://analytics.tiktok.com/i18n/pixel/events.js';
    ttq._i = ttq._i || {};
    ttq._i[id] = [];
    ttq._i[id]._u = src;
    ttq._t = ttq._t || {};
    ttq._t[id] = Date.now();
    ttq._o = ttq._o || {};
    ttq._o[id] = options || {};
    loadScript(`${src}?sdkid=${id}&lib=ttq`);
  };
  ttq.load(pixelId);
}

const identifyPayload = (identity: HashedIdentity) =>
  Object.fromEntries(Object.entries({ email: identity.em, phone_number: identity.ph_e164, external_id: identity.external_id }).filter(([, value]) => value));

export const tiktok: BrowserPlatform = {
  name: 'tiktok',
  enabled: () => Boolean(tracking.tiktok.pixelId),
  load(identity) {
    install(tracking.tiktok.pixelId);
    tiktok.identify?.(identity);
    window.ttq.page();
  },
  identify(identity) {
    const payload = identifyPayload(identity);
    if (Object.keys(payload).length) window.ttq?.identify(payload);
  },
  page() {
    window.ttq?.page();
  },
  track({ name, standard, data, eventId }) {
    const overrides = tracking.tiktok.names as Record<string, string | false>;
    const eventName = standard || name in overrides ? platformName(name, 'tiktok', overrides) : name;
    if (eventName) window.ttq?.track(eventName, toTikTok(data), { event_id: eventId });
  },
};
