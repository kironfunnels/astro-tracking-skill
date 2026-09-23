// Pinterest Conversions API (v5). https://developers.pinterest.com/docs/track-conversions/track-conversions-in-the-api/
// Deduplicates with the Pinterest tag through event_name + event_id (48 h window).
import { tracking } from '../config';
import { pinterestServerName } from '../events';
import type { Sender } from './relay';

export const sendPinterest: Sender = async (event, context, env) => {
  const { tagId, adAccountId } = tracking.pinterest;
  if (!tagId || !adAccountId || !env.PINTEREST_CONVERSIONS_TOKEN) return null;
  if ((tracking.pinterest.names as Record<string, string | false>)[event.event_name] === false) return null;
  const name = pinterestServerName(event.event_name);
  if (!name) return null;

  const user = event.user_data;
  const userData: Record<string, unknown> = {
    client_ip_address: context.ip || undefined,
    client_user_agent: context.userAgent || undefined,
    click_id: context.cookies._epik || event.click_ids.epik?.value,
  };
  for (const key of ['em', 'ph', 'fn', 'ln', 'ct', 'st', 'zp', 'country', 'external_id'] as const) if (user[key]) userData[key] = [user[key]];
  for (const key of Object.keys(userData)) if (userData[key] === undefined) delete userData[key];

  const data = event.custom_data;
  const customData = Object.fromEntries(Object.entries({
    currency: data.currency,
    value: data.value === undefined ? undefined : String(data.value),
    content_ids: data.content_ids,
    content_name: data.content_name,
    content_category: data.content_category,
    contents: data.contents?.map((item) => ({ id: item.id, quantity: item.quantity, item_price: item.item_price === undefined ? undefined : String(item.item_price) })),
    num_items: data.num_items,
    order_id: data.order_id,
    search_string: data.search_string,
  }).filter(([, value]) => value !== undefined));

  const payload = {
    data: [{
      event_name: name,
      action_source: 'web',
      event_time: Math.floor(context.now / 1000),
      event_id: event.event_id,
      event_source_url: event.event_source_url,
      user_data: userData,
      custom_data: customData,
    }],
  };
  const test = event.test.pinterest ? '?test=true' : '';
  return {
    url: `https://api.pinterest.com/v5/ad_accounts/${adAccountId}/events${test}`,
    init: { headers: { Authorization: `Bearer ${env.PINTEREST_CONVERSIONS_TOKEN}` }, body: JSON.stringify(payload) },
  };
};
