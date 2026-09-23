// Microsoft Advertising UET. https://learn.microsoft.com/en-us/advertising/guides/uet-conversion-api-integration
// Custom events carry event_id, shared with the UET Conversions API for deduplication.
import { tracking } from '../config';
import { platformName } from '../events';
import type { HashedIdentity } from '../identity';
import { loadScript, type BrowserPlatform } from './types';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  interface Window { uetq?: any; UET?: any }
}

export function microsoftConsent(granted: boolean, mode: 'default' | 'update') {
  window.uetq = window.uetq || [];
  window.uetq.push('consent', mode, { ad_storage: granted ? 'granted' : 'denied' });
}

/** Enhanced conversions: UET accepts SHA-256 email (Microsoft normalization) and E.164 phone. */
function setPid(identity: HashedIdentity) {
  const pid: Record<string, string> = {};
  if (identity.em_microsoft) pid.em = identity.em_microsoft;
  if (identity.ph_e164) pid.ph = identity.ph_e164;
  if (Object.keys(pid).length) window.uetq?.push('set', { pid });
}

export const microsoft: BrowserPlatform = {
  name: 'microsoft',
  enabled: () => Boolean(tracking.microsoft.uetTagId),
  load(identity) {
    window.uetq = window.uetq || [];
    setPid(identity);
    const script = loadScript('https://bat.bing.com/bat.js');
    script.onload = () => {
      window.uetq = new window.UET({ ti: tracking.microsoft.uetTagId, enableAutoSpaTracking: true, q: window.uetq });
      window.uetq.push('pageLoad');
    };
  },
  identify: setPid,
  track({ name, standard, data, eventId }) {
    const overrides = tracking.microsoft.names as Record<string, string | false>;
    const action = standard || name in overrides ? platformName(name, 'microsoft', overrides) : name;
    if (!action) return;
    window.uetq?.push('event', action, {
      event_category: data.content_category,
      event_label: data.content_name,
      revenue_value: data.value,
      currency: data.currency,
      event_id: eventId,
    });
  },
};
