// Meta Conversions API. https://developers.facebook.com/docs/marketing-api/conversions-api
// Deduplicates with the Pixel through event_name + event_id (48 h window).
import { tracking } from '../config';
import { normalizeCode, normalizeName, normalizeZip, sha256 } from '../identity';
import type { ClickId, Sender } from './relay';

/** Update when Meta releases a new Graph API version (changelog: developers.facebook.com/docs/graph-api/changelog). */
export const META_GRAPH_VERSION = 'v26.0';

/** _fbc cookie, or built from the stored fbclid with the time it was first seen, as Meta documents. */
export function resolveFbc(cookies: Record<string, string>, fbclid?: ClickId) {
  if (cookies._fbc) return cookies._fbc;
  return fbclid ? `fb.1.${fbclid.ts}.${fbclid.value}` : undefined;
}

async function hashGeo(value: string | undefined, normalize: (input: string) => string) {
  const normalized = value ? normalize(value) : '';
  return normalized ? sha256(normalized) : undefined;
}

export const sendMeta: Sender = async (event, context, env) => {
  if (!tracking.meta.pixelId || !env.META_CAPI_TOKEN) return null;
  const override = (tracking.meta.names as Record<string, string | false>)[event.event_name];
  if (override === false) return null;
  const user = event.user_data;
  const { geo, cookies } = context;
  const hashed: Record<string, string | undefined> = {
    em: user.em,
    ph: user.ph,
    fn: user.fn,
    ln: user.ln,
    external_id: user.external_id,
    // Typed address wins; otherwise Cloudflare's IP-based location fills city/state/zip/country.
    ct: user.ct ?? (await hashGeo(geo.city, normalizeName)),
    st: user.st ?? (await hashGeo(geo.region, normalizeCode)),
    zp: user.zp ?? (await hashGeo(geo.postalCode, normalizeZip)),
    country: user.country ?? (await hashGeo(geo.country, normalizeCode)),
  };
  const userData: Record<string, unknown> = {
    client_ip_address: context.ip || undefined,
    client_user_agent: context.userAgent || undefined,
    fbp: cookies._fbp,
    fbc: resolveFbc(cookies, event.click_ids.fbclid),
  };
  for (const [key, value] of Object.entries(hashed)) if (value) userData[key] = [value];
  for (const key of Object.keys(userData)) if (userData[key] === undefined) delete userData[key];

  const payload: Record<string, unknown> = {
    data: [{
      event_name: override || event.event_name,
      event_time: Math.floor(context.now / 1000),
      event_id: event.event_id,
      event_source_url: event.event_source_url,
      referrer_url: event.referrer_url,
      action_source: 'website',
      user_data: userData,
      custom_data: Object.keys(event.custom_data).length ? event.custom_data : undefined,
    }],
  };
  const testCode = env.META_TEST_EVENT_CODE || event.test.meta;
  if (testCode) payload.test_event_code = testCode;

  return {
    url: `https://graph.facebook.com/${META_GRAPH_VERSION}/${tracking.meta.pixelId}/events?access_token=${encodeURIComponent(env.META_CAPI_TOKEN)}`,
    init: { body: JSON.stringify(payload) },
  };
};
