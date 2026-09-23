// LinkedIn Insight Tag. https://learn.microsoft.com/en-us/linkedin/marketing/integrations/ads-reporting/conversions-api
// Only events mapped to a conversion_id (Campaign Manager → Measurement → Conversion tracking) are sent.
import { tracking } from '../config';
import { loadScript, type BrowserPlatform } from './types';

type Lintrk = ((action: string, data: Record<string, unknown>) => void) & { q: unknown[] };
declare global {
  interface Window { lintrk?: Lintrk; _linkedin_data_partner_ids?: string[] }
}

export const linkedin: BrowserPlatform = {
  name: 'linkedin',
  enabled: () => Boolean(tracking.linkedin.partnerId),
  load() {
    window._linkedin_data_partner_ids = window._linkedin_data_partner_ids || [];
    window._linkedin_data_partner_ids.push(tracking.linkedin.partnerId);
    if (!window.lintrk) {
      const lintrk = function (action: string, data: Record<string, unknown>) {
        lintrk.q.push([action, data]);
      } as Lintrk;
      lintrk.q = [];
      window.lintrk = lintrk;
    }
    loadScript('https://snap.licdn.com/li.lms-analytics/insight.min.js');
  },
  track({ name, eventId }) {
    const conversionId = (tracking.linkedin.conversions as Record<string, number | undefined>)[name];
    if (conversionId) window.lintrk?.('track', { conversion_id: conversionId, event_id: eventId });
  },
};
