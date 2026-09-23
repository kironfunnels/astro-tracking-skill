// Google Tag Manager, only for clients who keep a container. Events become dataLayer pushes carrying the shared
// event_id, so tags inside GTM can reuse it for deduplication. Never configure inside GTM a pixel that this
// runtime already loads directly, or every event is counted twice.
import { tracking } from '../config';
import { loadScript, type BrowserPlatform } from './types';

export const gtm: BrowserPlatform = {
  name: 'gtm',
  enabled: () => Boolean(tracking.gtm.containerId),
  load() {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });
    loadScript(`https://www.googletagmanager.com/gtm.js?id=${tracking.gtm.containerId}`);
  },
  identify(identity) {
    window.dataLayer.push({ event: 'trk_identify', user_data_hashed: identity });
  },
  track({ name, data, eventId }) {
    window.dataLayer.push({ event: name, event_id: eventId, ...data });
  },
};
