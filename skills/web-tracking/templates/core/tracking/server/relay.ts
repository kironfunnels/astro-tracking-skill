// Server relay: receives the browser's event (same event_id the pixels used), validates it, enriches it with what
// only the server knows (IP, user agent, cookies, geolocation) and forwards it to every server API that has a token.
// Host-agnostic: it only needs a standard Request, so the same code runs in Cloudflare (Pages/Workers), Vercel,
// Netlify, Next.js, Nuxt, SvelteKit, Astro endpoints, Deno or Bun. See templates/adapters/ for the thin entry points.
import { tracking } from '../config';
import { isStandardEvent, SERVER_DATA_KEYS, type EventData } from '../events';
import { pickHashed, type HashedIdentity } from '../identity';
import { sendMeta } from './meta';
import { sendMicrosoft } from './microsoft';
import { sendPinterest } from './pinterest';
import { sendTikTok } from './tiktok';

/** Secrets from the host (Cloudflare secrets, Vercel/Netlify environment variables). A platform without its token is skipped silently. */
export interface RelayEnv {
  META_CAPI_TOKEN?: string;
  META_TEST_EVENT_CODE?: string;
  TIKTOK_EVENTS_TOKEN?: string;
  TIKTOK_TEST_EVENT_CODE?: string;
  PINTEREST_CONVERSIONS_TOKEN?: string;
  MICROSOFT_CAPI_TOKEN?: string;
}

export interface ClickId { value: string; ts: number }

export interface RelayEvent {
  event_name: string;
  event_id: string;
  event_source_url: string;
  referrer_url?: string;
  custom_data: EventData;
  user_data: HashedIdentity;
  visitor_id?: string;
  click_ids: Record<string, ClickId>;
  test: { meta?: string; tiktok?: string; pinterest?: boolean };
}

export interface RelayContext {
  ip?: string | null;
  userAgent?: string | null;
  cookies: Record<string, string>;
  geo: { city?: string; region?: string; postalCode?: string; country?: string };
  /** Milliseconds */
  now: number;
}

type CfRequest = Request & { cf?: { city?: string; regionCode?: string; postalCode?: string; country?: string } };

function decode(value: string | null) {
  if (!value) return undefined;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Visitor IP and IP-based location, from whichever host is in front of the relay. */
export function clientInfo(request: CfRequest): Pick<RelayContext, 'ip' | 'geo'> {
  const header = (name: string) => request.headers.get(name);
  const forwarded = header('x-forwarded-for')?.split(',')[0]?.trim();
  const ip = header('cf-connecting-ip') ?? header('x-vercel-forwarded-for')?.split(',')[0]?.trim() ?? header('x-real-ip') ?? forwarded ?? null;
  if (request.cf) {
    const { city, regionCode, postalCode, country } = request.cf;
    return { ip, geo: { city, region: regionCode, postalCode, country } };
  }
  if (header('x-vercel-ip-country')) {
    return {
      ip,
      geo: { city: decode(header('x-vercel-ip-city')), region: decode(header('x-vercel-ip-country-region')), postalCode: decode(header('x-vercel-ip-postal-code')), country: decode(header('x-vercel-ip-country')) },
    };
  }
  // Netlify (context.ip/context.geo) and SvelteKit on Cloudflare (platform.cf) pass these via handleRelay's `client`.
  return { ip, geo: {} };
}

export function parseCookies(header: string | null): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const part of (header ?? '').split(';')) {
    const index = part.indexOf('=');
    if (index < 1) continue;
    const name = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    try {
      cookies[name] = decodeURIComponent(value);
    } catch {
      cookies[name] = value;
    }
  }
  return cookies;
}

const hostAllowed = (hostname: string) => tracking.hosts.includes(hostname);
const text = (value: unknown, max = 500) => (typeof value === 'string' && value.length <= max ? value : undefined);
const TOKEN = /^[\w.~-]{1,300}$/;

function cleanCustomData(input: unknown): EventData {
  const source = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const data: Record<string, unknown> = {};
  for (const key of SERVER_DATA_KEYS) {
    const value = source[key];
    if (typeof value === 'number' && Number.isFinite(value)) data[key] = value;
    else if (typeof value === 'string' && value.length <= 200) data[key] = value;
    else if (key === 'content_ids' && Array.isArray(value)) data.content_ids = value.filter((id) => typeof id === 'string').slice(0, 50);
    else if (key === 'contents' && Array.isArray(value)) {
      data.contents = value
        .filter((item) => item && typeof item.id === 'string' && Number.isFinite(item.quantity))
        .slice(0, 50)
        .map((item) => ({ id: item.id, quantity: item.quantity, item_price: Number.isFinite(item.item_price) ? item.item_price : undefined }));
    }
  }
  return data as EventData;
}

/** Returns null for anything that is not a well-formed event from one of our own pages. */
export function validateEvent(input: unknown): RelayEvent | null {
  if (!input || typeof input !== 'object') return null;
  const event = input as Record<string, unknown>;
  const name = event.event_name;
  if (typeof name !== 'string' || !(isStandardEvent(name) || tracking.serverCustomEvents.includes(name))) return null;
  if (typeof event.event_id !== 'string' || !/^[\w-]{8,64}$/.test(event.event_id)) return null;
  let source: URL;
  try {
    source = new URL(String(event.event_source_url));
  } catch {
    return null;
  }
  if (!hostAllowed(source.hostname)) return null;

  const clickInput = (event.click_ids && typeof event.click_ids === 'object' ? event.click_ids : {}) as Record<string, { value?: unknown; ts?: unknown }>;
  const click_ids: Record<string, ClickId> = {};
  for (const [id, click] of Object.entries(clickInput)) {
    if (click && typeof click.value === 'string' && TOKEN.test(click.value) && typeof click.ts === 'number') click_ids[id] = { value: click.value, ts: click.ts };
  }
  const test = (event.test && typeof event.test === 'object' ? event.test : {}) as Record<string, unknown>;
  const testCode = (value: unknown) => (typeof value === 'string' && /^TEST\w{3,20}$/.test(value) ? value : undefined);

  return {
    event_name: name,
    event_id: event.event_id,
    event_source_url: source.toString(),
    referrer_url: text(event.referrer_url, 2000),
    custom_data: cleanCustomData(event.custom_data),
    user_data: pickHashed(event.user_data),
    visitor_id: typeof event.visitor_id === 'string' && /^[\w-]{8,64}$/.test(event.visitor_id) ? event.visitor_id : undefined,
    click_ids,
    test: { meta: testCode(test.meta), tiktok: testCode(test.tiktok), pinterest: test.pinterest === true || undefined },
  };
}

async function post(platform: string, url: string, init: RequestInit) {
  try {
    const response = await fetch(url, { method: 'POST', ...init, headers: { 'Content-Type': 'application/json', ...init.headers } });
    if (!response.ok) console.error(`[relay] ${platform} ${response.status}`, (await response.text()).slice(0, 1000));
  } catch (error) {
    console.error(`[relay] ${platform} request failed`, error);
  }
}

export type Sender = (event: RelayEvent, context: RelayContext, env: RelayEnv) => Promise<{ url: string; init: RequestInit } | null>;

const SENDERS: [string, Sender][] = [['meta', sendMeta], ['tiktok', sendTikTok], ['pinterest', sendPinterest], ['microsoft', sendMicrosoft]];

/** Builds every platform request. Exported for tests. */
export async function buildRequests(event: RelayEvent, context: RelayContext, env: RelayEnv) {
  const requests: { platform: string; url: string; init: RequestInit }[] = [];
  for (const [platform, send] of SENDERS) {
    const request = await send(event, context, env);
    if (request) requests.push({ platform, ...request });
  }
  return requests;
}

/**
 * @param waitUntil Background-task hook of the host (Cloudflare ctx.waitUntil, Vercel/Netlify waitUntil, Next.js after).
 *                  Without it the relay waits for the platforms before answering (fine on Node servers).
 */
export async function handleRelay(
  request: CfRequest,
  env: RelayEnv,
  waitUntil?: (promise: Promise<unknown>) => void,
  /** Host-provided IP/geo when the Request itself does not carry them (Netlify context, SvelteKit platform.cf). */
  client?: Partial<Pick<RelayContext, 'ip' | 'geo'>>,
): Promise<Response> {
  const origin = request.headers.get('Origin');
  let allowedOrigin: string | undefined;
  if (origin) {
    try {
      if (!hostAllowed(new URL(origin).hostname)) return new Response(null, { status: 403 });
      allowedOrigin = origin;
    } catch {
      return new Response(null, { status: 403 });
    }
  }
  // CORS only matters when the relay lives on another subdomain (e.g. a Worker at track.example.com).
  const headers: Record<string, string> = { 'Cache-Control': 'no-store' };
  if (allowedOrigin && allowedOrigin !== new URL(request.url).origin) {
    Object.assign(headers, { 'Access-Control-Allow-Origin': allowedOrigin, 'Access-Control-Allow-Credentials': 'true', Vary: 'Origin' });
  }
  const empty = (status: number) => new Response(null, { status, headers });
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { ...headers, 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400' } });
  }
  if (request.method !== 'POST') return new Response(null, { status: 405, headers: { ...headers, Allow: 'POST, OPTIONS' } });
  const body = await request.text();
  if (body.length > 16_000) return empty(413);
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return empty(400);
  }
  const event = validateEvent(parsed);
  if (!event) return empty(400);

  const context: RelayContext = {
    ...clientInfo(request),
    ...client,
    userAgent: request.headers.get('User-Agent'),
    cookies: parseCookies(request.headers.get('Cookie')),
    now: Date.now(),
  };
  const requests = await buildRequests(event, context, env);
  const delivery = Promise.all(requests.map(({ platform, url, init }) => post(platform, url, init)));
  // Respond at once when the host can finish work in the background; otherwise wait.
  if (waitUntil) waitUntil(delivery);
  else await delivery;
  return empty(204);
}
