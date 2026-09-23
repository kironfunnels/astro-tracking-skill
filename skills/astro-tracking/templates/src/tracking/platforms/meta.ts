// Meta Pixel. https://developers.facebook.com/docs/meta-pixel
// Every event carries eventID; the relay sends the same id to the Conversions API so Meta deduplicates them.
import { tracking } from '../config';
import { isStandardEvent } from '../events';
import type { HashedIdentity } from '../identity';
import { loadScript, type BrowserPlatform } from './types';

type Fbq = ((...args: unknown[]) => void) & { callMethod?: (...args: unknown[]) => void; queue: unknown[]; push: Fbq; loaded: boolean; version: string };
declare global {
  interface Window { fbq?: Fbq; _fbq?: Fbq }
}

/** Advanced matching accepts SHA-256 digests. */
const matching = (identity: HashedIdentity) =>
  Object.fromEntries(
    (['em', 'ph', 'fn', 'ln', 'ct', 'st', 'zp', 'country', 'external_id'] as const)
      .filter((key) => identity[key])
      .map((key) => [key, identity[key]]),
  );

export const meta: BrowserPlatform = {
  name: 'meta',
  enabled: () => Boolean(tracking.meta.pixelId),
  load(identity) {
    if (!window.fbq) {
      const fbq = function (...args: unknown[]) {
        fbq.callMethod ? fbq.callMethod(...args) : fbq.queue.push(args);
      } as Fbq;
      fbq.push = fbq;
      fbq.loaded = true;
      fbq.version = '2.0';
      fbq.queue = [];
      window.fbq = window._fbq = fbq;
      loadScript('https://connect.facebook.net/en_US/fbevents.js');
    }
    window.fbq('init', tracking.meta.pixelId, matching(identity));
  },
  // No identify(): the Pixel only honors advanced matching (em/ph) from the FIRST fbq('init') of the page.
  // A second init, fbq('set', 'userData') or setUserData are ignored (verified in production), so the email and
  // phone of a conversion reach Meta through the server copy with the same event_id. The hashes stored after a
  // conversion feed the first init on later visits.
  track({ name, standard, data, eventId }) {
    const overrides = tracking.meta.names as Record<string, string | false>;
    if (overrides[name] === false) return;
    const eventName = overrides[name] || name;
    window.fbq?.(standard && isStandardEvent(eventName) ? 'track' : 'trackCustom', eventName, data, { eventID: eventId });
  },
};
