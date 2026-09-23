// Pinterest tag. https://developers.pinterest.com/docs/track-conversions/track-conversions-in-the-api/
// event_id is shared with the Conversions API for deduplication.
import { tracking } from '../config';
import { platformName, toPinterestTag } from '../events';
import { loadScript, type BrowserPlatform } from './types';

type Pintrk = ((...args: unknown[]) => void) & { queue: unknown[]; version: string };
declare global {
  interface Window { pintrk?: Pintrk }
}

export const pinterest: BrowserPlatform = {
  name: 'pinterest',
  enabled: () => Boolean(tracking.pinterest.tagId),
  load(identity) {
    if (!window.pintrk) {
      const pintrk = function (...args: unknown[]) {
        pintrk.queue.push(args);
      } as Pintrk;
      pintrk.queue = [];
      pintrk.version = '3.0';
      window.pintrk = pintrk;
      loadScript('https://s.pinimg.com/ct/core.js');
    }
    // Enhanced match accepts a SHA-256 email.
    window.pintrk('load', tracking.pinterest.tagId, identity.em ? { em: identity.em } : {});
    window.pintrk('page');
  },
  identify(identity) {
    if (identity.em) window.pintrk?.('set', { em: identity.em });
  },
  page() {
    window.pintrk?.('page');
  },
  track({ name, standard, data, eventId }) {
    if (!standard) return;
    const eventName = platformName(name, 'pinterest', tracking.pinterest.names as Record<string, string | false>);
    if (eventName) window.pintrk?.('track', eventName, { ...toPinterestTag(data), event_id: eventId });
  },
};
