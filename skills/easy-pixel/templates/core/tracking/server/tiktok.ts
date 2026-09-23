// TikTok Events API 2.0 (v1.3). https://business-api.tiktok.com/portal/docs/events-api-2.0/v1.3
// Deduplicates with the Pixel through event + event_id (first event wins, 48 h window).
import { tracking } from '../config';
import { isStandardEvent, platformName, toTikTok } from '../events';
import type { Sender } from './relay';

export const TIKTOK_ENDPOINT = 'https://business-api.tiktok.com/open_api/v1.3/event/track/';

export const sendTikTok: Sender = async (event, context, env) => {
  if (!tracking.tiktok.pixelId || !env.TIKTOK_EVENTS_TOKEN) return null;
  // ttq.page() carries no event_id, so a server copy of PageView could not be deduplicated.
  if (event.event_name === 'PageView') return null;
  const overrides = tracking.tiktok.names as Record<string, string | false>;
  const name = isStandardEvent(event.event_name) || event.event_name in overrides ? platformName(event.event_name, 'tiktok', overrides) : event.event_name;
  if (!name) return null;

  const user = event.user_data;
  const userData = Object.fromEntries(Object.entries({
    email: user.em,
    phone: user.ph_e164,
    external_id: user.external_id,
    ttp: context.cookies._ttp,
    ttclid: event.click_ids.ttclid?.value,
    ip: context.ip || undefined,
    user_agent: context.userAgent || undefined,
  }).filter(([, value]) => value));

  const payload: Record<string, unknown> = {
    event_source: 'web',
    event_source_id: tracking.tiktok.pixelId,
    data: [{
      event: name,
      event_time: Math.floor(context.now / 1000),
      event_id: event.event_id,
      user: userData,
      page: { url: event.event_source_url, referrer: event.referrer_url },
      properties: toTikTok(event.custom_data),
    }],
  };
  const testCode = env.TIKTOK_TEST_EVENT_CODE || event.test.tiktok;
  if (testCode) payload.test_event_code = testCode;

  return { url: TIKTOK_ENDPOINT, init: { headers: { 'Access-Token': env.TIKTOK_EVENTS_TOKEN }, body: JSON.stringify(payload) } };
};
