// URL parameter persistence. Every query parameter a visitor lands with (utm_*, click IDs and any other
// campaign parameter) is stored first-party and carried to the next pages, to allowed external domains
// (checkout, forms) and into hidden form fields, so attribution survives internal navigation.
import { tracking } from './config';

/** Click IDs kept separately (with the time they were first seen) for the server relay. */
export const CLICK_IDS = ['gclid', 'gbraid', 'wbraid', 'dclid', 'fbclid', 'ttclid', 'msclkid', 'li_fat_id', 'epik', 'twclid', 'ScCid', 'rdt_cid'] as const;
export type ClickId = (typeof CLICK_IDS)[number];

const STORE_KEY = 'trk_params';
const MAX_AGE_MS = 90 * 86_400_000;
// Our own control parameters and the GA linker (gtag reads and rewrites _gl itself).
const NEVER_PERSIST = /^(trk_|_gl$|__)/;
// URLs are sent to every pixel; personal data in them violates Meta/Google policies. Keep it out of links.
const PERSONAL_NAME = /(e-?mail|phone|fone|telefone|celular|whats|cpf|cnpj|rg$|nome|name|senha|password|token|address|endereco)/i;

interface Touch { params: Record<string, string>; landing: string; referrer: string; ts: number }
export interface ParamStore { first?: Touch; last?: Touch; clicks: Partial<Record<ClickId, { value: string; ts: number }>> }

function read(): ParamStore {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
    return { clicks: {}, ...parsed };
  } catch {
    return { clicks: {} };
  }
}

function write(store: ParamStore) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch {
    /* storage blocked: parameters still ride along on this page's links via `memory` */
  }
}

let memory: ParamStore = { clicks: {} };

const fresh = (touch?: Touch) => (touch && Date.now() - touch.ts < MAX_AGE_MS ? touch : undefined);

function persistable(search: URLSearchParams) {
  const params: Record<string, string> = {};
  for (const [key, value] of search) {
    if (!value || value.length > 500 || NEVER_PERSIST.test(key) || PERSONAL_NAME.test(key) || value.includes('@')) continue;
    params[key] = value;
  }
  return params;
}

/** Call once per page, before anything reads parameters. */
export function captureParams(): ParamStore {
  const store = read();
  store.first = fresh(store.first);
  store.last = fresh(store.last);
  for (const id of CLICK_IDS) if (store.clicks[id] && Date.now() - store.clicks[id]!.ts > MAX_AGE_MS) delete store.clicks[id];

  const incoming = persistable(new URLSearchParams(location.search));
  // A new touch is a campaign arrival: utm_* or a click ID, or any parameter on an entry from outside the site.
  // Internal navigation with ?page=2 or ?sort=price must not erase the campaign that brought the visitor.
  const campaign = Object.keys(incoming).some((key) => key.startsWith('utm_') || (CLICK_IDS as readonly string[]).includes(key));
  let external = true;
  try {
    external = !document.referrer || registrableDomain(new URL(document.referrer).hostname) !== registrableDomain();
  } catch {
    /* unparsable referrer: treat as external */
  }
  if (Object.keys(incoming).length && (campaign || external)) {
    const touch: Touch = { params: incoming, landing: location.origin + location.pathname, referrer: document.referrer, ts: Date.now() };
    store.first ??= touch;
    // A new campaign visit replaces the previous set as a whole (last-touch), so stale utm_* never mix with new ones.
    store.last = touch;
    for (const id of CLICK_IDS) {
      const value = incoming[id];
      if (value && store.clicks[id]?.value !== value) store.clicks[id] = { value, ts: Date.now() };
    }
  }
  memory = store;
  write(store);
  return store;
}

/** URL without personal-data parameters, e-mails in the path or our trk_* control flags, for event_source_url and
 *  similar fields. Pure (no DOM), so the relay applies it again server-side. */
export function sanitizeUrl(href: string) {
  try {
    const url = new URL(href);
    for (const [key, value] of [...url.searchParams]) {
      if (PERSONAL_NAME.test(key) || value.includes('@') || key.startsWith('trk_')) url.searchParams.delete(key);
    }
    url.pathname = url.pathname.split('/').map((segment) => (decodeSafe(segment).includes('@') ? 'redacted' : segment)).join('/');
    url.username = '';
    url.password = '';
    return url.toString();
  } catch {
    return href;
  }
}

function decodeSafe(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export const currentParams = () => memory.last?.params ?? {};
export const paramStore = () => memory;

/** Registrable domain (example.com, example.com.br, project.pages.dev) for cookies and link decoration. */
export function registrableDomain(hostname = location.hostname) {
  const parts = hostname.split('.');
  if (parts.length < 3 || /^[\d.]+$/.test(hostname) || hostname.includes(':')) return hostname;
  const twoLevel = /\.(com|net|org|gov|edu|co|ind|adv|eng|med)\.(br|uk|au|mx|ar|jp|nz|za|in|co)$/.test(hostname)
    || /\.(pages\.dev|workers\.dev|vercel\.app|netlify\.app|github\.io)$/.test(hostname);
  return parts.slice(twoLevel ? -3 : -2).join('.');
}

function allowedHost(hostname: string) {
  const base = registrableDomain();
  const matches = (domain: string) => hostname === domain || hostname.endsWith(`.${domain}`);
  return hostname === location.hostname || matches(base) || tracking.decorateDomains.some(matches);
}

/** Adds the stored parameters the URL does not already carry. The link's own values always win. */
export function decorateUrl(href: string): string {
  const params = currentParams();
  if (!Object.keys(params).length || !href || href.startsWith('#')) return href;
  let url: URL;
  try {
    url = new URL(href, location.href);
  } catch {
    return href;
  }
  if (!/^https?:$/.test(url.protocol) || !allowedHost(url.hostname)) return href;
  // In-page anchors must stay in-page: turning them into a new query would reload the page.
  if (url.hash && url.origin === location.origin && url.pathname === location.pathname && url.search === location.search) return href;
  let changed = false;
  for (const [key, value] of Object.entries(params)) {
    if (url.searchParams.has(key)) continue;
    url.searchParams.set(key, value);
    changed = true;
  }
  if (!changed) return href;
  // Keep relative links relative (same markup, same behavior behind proxies and previews).
  const relative = !/^[a-z][a-z\d+.-]*:|^\/\//i.test(href);
  return relative && url.origin === location.origin ? url.pathname + url.search + url.hash : url.toString();
}

function decorateLink(link: HTMLAnchorElement | HTMLAreaElement) {
  if (link.closest('[data-trk-no-params]')) return;
  const href = link.getAttribute('href');
  if (!href) return;
  const decorated = decorateUrl(href);
  if (decorated !== href) link.setAttribute('href', decorated);
}

/** Hidden inputs named like a parameter get its last-touch value; "first_<name>" gets the first-touch value. */
function fillForm(form: HTMLFormElement) {
  const last = memory.last?.params ?? {};
  const first = memory.first?.params ?? {};
  const extra: Record<string, string | undefined> = {
    landing_page: memory.last?.landing,
    first_landing_page: memory.first?.landing,
    referrer: memory.last?.referrer,
  };
  for (const input of form.querySelectorAll<HTMLInputElement>('input[type="hidden"][name]')) {
    if (input.value) continue;
    const name = input.name;
    const value = last[name] ?? (name.startsWith('first_') ? first[name.slice(6)] : undefined) ?? extra[name];
    if (value) input.value = value;
  }
  // GET forms rebuild the query string from their fields, so the parameters must become fields.
  if ((form.method || 'get').toLowerCase() === 'get' && !form.closest('[data-trk-no-params]')) {
    const action = new URL(form.action || location.href, location.href);
    if (!allowedHost(action.hostname)) return;
    for (const [key, value] of Object.entries(last)) {
      if (form.elements.namedItem(key)) continue;
      form.append(Object.assign(document.createElement('input'), { type: 'hidden', name: key, value }));
    }
  }
}

/** Elements with data-trk-params="src" (or any attribute list, e.g. "src data-url") get those attributes decorated. */
function decorateAttributes(element: Element) {
  const attributes = (element.getAttribute('data-trk-params') || 'src').split(/\s+/).filter(Boolean);
  for (const attribute of attributes) {
    const value = element.getAttribute(attribute);
    if (!value) continue;
    const decorated = decorateUrl(value);
    if (decorated !== value) element.setAttribute(attribute, decorated);
  }
}

function decorateAll(root: ParentNode = document) {
  root.querySelectorAll<HTMLAnchorElement>('a[href], area[href]').forEach(decorateLink);
  root.querySelectorAll<HTMLFormElement>('form').forEach(fillForm);
  root.querySelectorAll('[data-trk-params]').forEach(decorateAttributes);
}

export function startDecorating() {
  decorateAll();
  let scheduled = false;
  new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      decorateAll();
    });
  }).observe(document.documentElement, { childList: true, subtree: true });
  // Last line of defense for links whose href changes right before navigation.
  const onClick = (event: Event) => {
    const link = (event.target as Element | null)?.closest?.('a[href], area[href]');
    if (link) decorateLink(link as HTMLAnchorElement);
  };
  document.addEventListener('click', onClick, true);
  document.addEventListener('auxclick', onClick, true);
  document.addEventListener('submit', (event) => fillForm(event.target as HTMLFormElement), true);
}
