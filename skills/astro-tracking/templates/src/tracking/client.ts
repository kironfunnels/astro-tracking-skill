// Browser runtime: loads the configured tags directly (no GTM), gives every event one event_id shared by the
// pixels and the server relay, persists URL parameters and exposes window.tracking for pages and embeds.
import { tracking } from './config';
import { isStandardEvent, SERVER_DATA_KEYS, type EventData } from './events';
import { hashUser, sha256, type HashedIdentity, type UserInput } from './identity';
import { CLICK_IDS, captureParams, decorateUrl, paramStore, registrableDomain, sanitizeUrl, startDecorating } from './params';
import { google, googleConsentDefault, googleConsentUpdate } from './platforms/google';
import { gtm } from './platforms/gtm';
import { linkedin } from './platforms/linkedin';
import { meta } from './platforms/meta';
import { microsoft, microsoftConsent } from './platforms/microsoft';
import { pinterest } from './platforms/pinterest';
import { tiktok } from './platforms/tiktok';
import type { BrowserPlatform, TrackedEvent } from './platforms/types';

const IDENTITY_KEY = 'trk_identity';
const CONSENT_KEY = 'trk_consent';
const VISITOR_COOKIE = 'trk_vid';

type TrackingApi = {
  track: (name: string, data?: EventData, user?: UserInput) => Promise<string>;
  identify: (user: UserInput) => Promise<void>;
  consent: (granted: boolean) => void;
  decorateUrl: (href: string) => string;
  params: typeof paramStore;
};
declare global {
  interface Window { tracking?: TrackingApi; trackingQueue?: { push: (callback: (api: TrackingApi) => void) => void } | ((api: TrackingApi) => void)[] }
}

const platforms: BrowserPlatform[] = [meta, google, gtm, tiktok, pinterest, microsoft, linkedin].filter((platform) => platform.enabled());
const installed = new Set<BrowserPlatform>();
/** Platforms currently receiving events. Revoking consent removes all but Google (which honors consent mode). */
const active = new Set<BrowserPlatform>();
const pending: TrackedEvent[] = [];
let identity: HashedIdentity = {};
let visitorId = '';
let granted = false;
const debug = () => session('trk_debug') === '1';

// ---------- small helpers ----------

function uuid() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function readCookie(name: string) {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}

/** IPs and single-label hosts (localhost) only accept host-only cookies. */
const hostOnly = () => !location.hostname.includes('.') || /^[\d.]+$|:/.test(location.hostname);

function writeCookie(name: string, value: string, days: number) {
  const scope = hostOnly() ? '' : `; domain=.${registrableDomain()}`;
  const secure = location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${name}=${encodeURIComponent(value)}; max-age=${days * 86400}; path=/; SameSite=Lax${secure}${scope}`;
}

/** Session-scoped flags that may arrive in the URL once (trk_enable, trk_debug, test codes) and last for the tab. */
function session(name: string) {
  const fromUrl = new URLSearchParams(location.search).get(name);
  try {
    if (fromUrl !== null) sessionStorage.setItem(name, fromUrl);
    return sessionStorage.getItem(name) ?? undefined;
  } catch {
    return fromUrl ?? undefined;
  }
}

function storage(key: string, value?: string) {
  try {
    if (value === undefined) return localStorage.getItem(key) ?? undefined;
    localStorage.setItem(key, value);
  } catch {
    /* storage blocked: the value lives only for this page */
  }
  return undefined;
}

/** Test codes are per tab, so validating in Events Manager never diverts real visitors' events. */
function testCodes() {
  const code = (name: string) => {
    const value = session(name);
    return value && /^TEST\w{3,20}$/.test(value) ? value : undefined;
  };
  return { meta: code('trk_test_meta'), tiktok: code('trk_test_tiktok'), pinterest: session('trk_test_pinterest') === '1' || undefined };
}

// Meta documents creating _fbp/_fbc first-party when the Pixel cannot: fb.<subdomainIndex>.<creationTimeMs>.<value>,
// where subdomainIndex counts the parts of the cookie domain minus one (example.com → 1, example.com.br → 2,
// host-only cookie on an IP or localhost → 0). A fixed "fb.1" is wrong for .com.br domains.
function ensureMetaCookies() {
  if (!meta.enabled()) return;
  const index = hostOnly() ? 0 : registrableDomain().split('.').length - 1;
  if (!readCookie('_fbp')) writeCookie('_fbp', `fb.${index}.${Date.now()}.${Math.floor(Math.random() * 2147483647)}`, 90);
  const fbclid = paramStore().clicks.fbclid;
  const fbc = readCookie('_fbc');
  if (fbclid && !(fbc && fbc.endsWith(`.${fbclid.value}`))) writeCookie('_fbc', `fb.${index}.${fbclid.ts}.${fbclid.value}`, 90);
}

// ---------- dispatch ----------

function sendToServer(event: TrackedEvent) {
  if (!tracking.endpoint) return;
  if (!event.standard && !tracking.serverCustomEvents.includes(event.name)) return;
  if (tracking.browserOnlyEvents.includes(event.name)) return;
  const clicks = paramStore().clicks;
  const body = JSON.stringify({
    event_name: event.name,
    event_id: event.eventId,
    event_source_url: sanitizeUrl(location.href),
    referrer_url: document.referrer ? sanitizeUrl(document.referrer) : undefined,
    custom_data: Object.fromEntries(SERVER_DATA_KEYS.filter((key) => event.data[key] !== undefined).map((key) => [key, event.data[key]])),
    user_data: event.identity,
    visitor_id: visitorId,
    click_ids: Object.fromEntries(CLICK_IDS.filter((id) => clicks[id]).map((id) => [id, clicks[id]])),
    test: testCodes(),
  });
  // sendBeacon survives the navigation that usually follows a conversion (redirect to a thank-you page or
  // WhatsApp). fetch keepalive alone was lost in in-app browsers (Instagram) on redirect. fetch is the fallback.
  const queued = typeof navigator.sendBeacon === 'function' && navigator.sendBeacon(tracking.endpoint, new Blob([body], { type: 'application/json' }));
  if (!queued) {
    fetch(tracking.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true, credentials: 'same-origin' }).catch(() => {});
  }
}

function deliver(event: TrackedEvent, targets: Iterable<BrowserPlatform>) {
  for (const platform of targets) {
    try {
      platform.track(event);
    } catch (error) {
      console.error(`[tracking] ${platform.name}`, error);
    }
  }
}

function dispatch(event: TrackedEvent) {
  if (debug()) console.info('[tracking]', event.name, event.eventId, event.data);
  // Before consent only tags loaded in consent mode (Google) receive the event; the rest waits in `pending`.
  deliver(event, active);
  if (granted) sendToServer(event);
  else pending.push(event);
}

function loadPlatform(platform: BrowserPlatform) {
  try {
    if (!installed.has(platform)) platform.load(identity);
    installed.add(platform);
    active.add(platform);
  } catch (error) {
    console.error(`[tracking] ${platform.name} failed to load`, error);
  }
}

function grant() {
  if (granted) return;
  granted = true;
  const early = new Set(active);
  if (tracking.consent === 'opt-in') {
    googleConsentUpdate(true);
    if (microsoft.enabled()) microsoftConsent(true, 'update');
  }
  ensureMetaCookies();
  platforms.forEach(loadPlatform);
  const late = platforms.filter((platform) => !early.has(platform));
  for (const event of pending.splice(0)) {
    deliver(event, late);
    sendToServer(event);
  }
}

// ---------- public API ----------

export async function identify(user: UserInput) {
  const hashed = await hashUser(user, tracking.defaultCountryCode);
  identity = { ...identity, ...hashed };
  const { external_id: _, ...persisted } = identity;
  storage(IDENTITY_KEY, JSON.stringify(persisted));
  for (const platform of active) platform.identify?.(identity);
}

export async function track(name: string, data: EventData = {}, user?: UserInput): Promise<string> {
  if (user) await identify(user);
  const eventId = uuid();
  dispatch({ name, standard: isStandardEvent(name), data, eventId, identity });
  return eventId;
}

export function consent(value: boolean) {
  storage(CONSENT_KEY, value ? 'granted' : 'denied');
  if (value) return grant();
  if (tracking.consent === 'opt-in') {
    googleConsentUpdate(false);
    if (microsoft.enabled()) microsoftConsent(false, 'update');
  }
  window.fbq?.('consent', 'revoke');
  window.ttq?.revokeConsent?.();
  for (const platform of [...active]) if (platform !== google) active.delete(platform);
  granted = false;
}

// ---------- declarative bindings ----------

/** data-track-content-name="X" → { content_name: "X" }; numeric attributes become numbers. */
function dataFromAttributes(element: HTMLElement): EventData {
  const data: EventData = {};
  for (const [key, value] of Object.entries(element.dataset)) {
    if (!key.startsWith('track') || key === 'track' || key === 'trackForm' || value === undefined) continue;
    const name = key.slice(5).replace(/^[A-Z]/, (c) => c.toLowerCase()).replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
    data[name] = name === 'value' || name === 'num_items' ? Number(value) : value;
  }
  return data;
}

/** First visible field matching any selector. Hidden inputs (utm_*, first_utm_*) are never personal data. */
function field(form: HTMLFormElement, selector: string) {
  for (const input of form.querySelectorAll<HTMLInputElement | HTMLSelectElement>(selector)) {
    if (input.type === 'hidden') continue;
    const value = input.value?.trim();
    if (value) return value;
  }
  return undefined;
}

function userFromForm(form: HTMLFormElement): UserInput {
  const fullName = field(form, '[autocomplete="name"], input[name="name" i], input[name="nome" i], input[name="full_name" i]');
  const [first, ...rest] = (fullName ?? '').split(/\s+/);
  const ddi = field(form, 'select[name*="ddi" i], select[name*="country_code" i], input[name*="ddi" i]');
  return {
    email: field(form, 'input[type="email"], [autocomplete="email"], input[name*="email" i]'),
    phone: field(form, 'input[type="tel"], [autocomplete="tel"], input[name*="phone" i], input[name*="whats" i], input[name*="celular" i], input[name*="telefone" i]'),
    countryCode: ddi,
    firstName: field(form, '[autocomplete="given-name"], input[name="first_name" i], input[name="firstname" i], input[name="primeiro_nome" i]') ?? (first || undefined),
    lastName: field(form, '[autocomplete="family-name"], input[name="last_name" i], input[name="lastname" i], input[name="sobrenome" i]') ?? (rest.join(' ') || undefined),
  };
}

function bindDeclarative() {
  document.addEventListener('click', (event) => {
    const element = (event.target as Element | null)?.closest?.<HTMLElement>('[data-track]');
    if (element) track(element.dataset.track!, dataFromAttributes(element));
  }, true);
  // <form data-track-form="Lead"> fires on submit. Use only when submit == success (no server-side validation step).
  document.addEventListener('submit', (event) => {
    const form = event.target as HTMLFormElement;
    if (!form.matches?.('[data-track-form]')) return;
    track(form.dataset.trackForm || 'Lead', dataFromAttributes(form), userFromForm(form));
  }, true);
  // Embeds and third-party widgets announce confirmed conversions with:
  // document.dispatchEvent(new CustomEvent('tracking:event', { detail: { name: 'Lead', data: {...}, user: { email, phone } } }))
  document.addEventListener('tracking:event', (event) => {
    const detail = (event as CustomEvent).detail ?? {};
    if (typeof detail.name === 'string') track(detail.name, detail.data ?? {}, detail.user);
  });
}

function trackScroll() {
  if (!tracking.scroll.length) return;
  const sent = new Set<number>();
  let frame = 0;
  const check = () => {
    frame = 0;
    const height = document.documentElement.scrollHeight;
    const percent = height <= innerHeight ? 100 : ((scrollY + innerHeight) / height) * 100;
    for (const threshold of tracking.scroll) {
      if (percent < threshold || sent.has(threshold)) continue;
      sent.add(threshold);
      track('Scroll', { percent_scrolled: threshold });
    }
  };
  addEventListener('scroll', () => { if (!frame) frame = requestAnimationFrame(check); }, { passive: true });
  addEventListener('load', check, { once: true });
}

function exposeApi(api: TrackingApi) {
  const queued: ((api: TrackingApi) => void)[] = Array.isArray(window.trackingQueue) ? window.trackingQueue : [];
  window.tracking = api;
  window.trackingQueue = { push: (callback: (api: TrackingApi) => void) => callback(api) };
  for (const callback of queued) callback(api);
}

// ---------- start ----------

async function start() {
  captureParams();
  startDecorating();

  // Local builds (dev server, Playwright, Lighthouse) must not pollute real data. ?trk_enable=1 turns tracking on for the tab.
  const isLocal = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  if (isLocal && session('trk_enable') !== '1') {
    const noop = async () => '';
    exposeApi({ track: noop, identify: async () => {}, consent: () => {}, decorateUrl, params: paramStore });
    return;
  }

  try {
    identity = JSON.parse(storage(IDENTITY_KEY) || '{}');
  } catch {
    identity = {};
  }
  visitorId = readCookie(VISITOR_COOKIE) || uuid();
  writeCookie(VISITOR_COOKIE, visitorId, 400);
  identity.external_id = await sha256(visitorId);

  exposeApi({ track, identify, consent, decorateUrl, params: paramStore });
  bindDeclarative();

  const stored = storage(CONSENT_KEY);
  if (tracking.consent === 'opt-in') {
    // Advanced consent mode: Google loads with everything denied and sends cookieless pings until consent.
    googleConsentDefault(false);
    if (microsoft.enabled()) microsoftConsent(false, 'default');
    if (google.enabled()) loadPlatform(google);
  }
  if (tracking.consent === 'none' || stored === 'granted') grant();

  track('PageView');
  trackScroll();
}

start();
