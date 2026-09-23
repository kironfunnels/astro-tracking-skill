// Microsoft Advertising UET Conversions API. https://learn.microsoft.com/en-us/advertising/guides/uet-conversion-api-integration
// Deduplicates with the UET tag through the same tag ID + eventName + eventId.
import { tracking } from '../config';
import { isStandardEvent, platformName } from '../events';
import type { Sender } from './relay';

const UUID = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;

export const sendMicrosoft: Sender = async (event, context, env) => {
  const { uetTagId } = tracking.microsoft;
  if (!uetTagId || !env.MICROSOFT_CAPI_TOKEN) return null;
  // The UET tag already sends its own pageLoad without a shared id; a server copy would double count.
  if (event.event_name === 'PageView') return null;
  const overrides = tracking.microsoft.names as Record<string, string | false>;
  const action = isStandardEvent(event.event_name) || event.event_name in overrides ? platformName(event.event_name, 'microsoft', overrides) : event.event_name;
  if (!action) return null;

  const user = event.user_data;
  const msclkid = event.click_ids.msclkid?.value;
  const clean = (object: Record<string, unknown>) => Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined && value !== ''));
  const data = event.custom_data;
  const payload = {
    data: [clean({
      eventType: 'custom',
      eventId: event.event_id,
      eventName: action,
      eventTime: Math.floor(context.now / 1000),
      eventSourceUrl: event.event_source_url,
      referrerUrl: event.referrer_url,
      // The browser only calls the relay after consent, so the signal is always "granted" here.
      adStorageConsent: 'G',
      userData: clean({
        msclkid: msclkid && UUID.test(msclkid) ? msclkid : undefined,
        anonymousId: event.visitor_id,
        em: user.em_microsoft,
        ph: user.ph_e164,
        clientIpAddress: context.ip || undefined,
        clientUserAgent: context.userAgent || undefined,
      }),
      customData: clean({
        value: data.value,
        currency: data.currency,
        transactionId: data.order_id,
        eventCategory: data.content_category,
        eventLabel: data.content_name,
        searchTerm: data.search_string,
        itemIds: data.content_ids,
      }),
    })],
  };
  return {
    url: `https://capi.uet.microsoft.com/v1/${uetTagId}/events`,
    init: { headers: { Authorization: `Bearer ${env.MICROSOFT_CAPI_TOKEN}` }, body: JSON.stringify(payload) },
  };
};
