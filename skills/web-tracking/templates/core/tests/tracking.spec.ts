// Tracking regression tests. Vendor scripts are replaced by empty stubs and /api/events is intercepted,
// so nothing reaches Meta, Google, TikTok, Pinterest, Microsoft or LinkedIn during tests.
// Set TRACKING_TEST_PATH to the page that should be exercised (default "/").
// Imports assume core/tracking was copied to src/tracking; adjust the paths for other layouts (lib/, app/, shared/).
import { createHash } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { tracking } from '../src/tracking/config';
import { hashUser, normalizePhone } from '../src/tracking/identity';
import { pinterestNames } from '../src/tracking/events';
import { buildRequests, clientInfo, handleRelay, hasIssues, validateEvent, type RelayContext } from '../src/tracking/server/relay';

const PATH = process.env.TRACKING_TEST_PATH ?? '/';
const sha = (value: string) => createHash('sha256').update(value).digest('hex');
const VENDORS = /connect\.facebook\.net|googletagmanager\.com|analytics\.tiktok\.com|s\.pinimg\.com|bat\.bing\.com|snap\.licdn\.com/;

async function stubVendors(page: Page) {
  const serverEvents: Record<string, any>[] = [];
  await page.route(VENDORS, (route) => route.fulfill({ contentType: 'text/javascript', body: '' }));
  await page.route(`**${tracking.endpoint || '/api/events'}`, async (route) => {
    serverEvents.push(route.request().postDataJSON());
    await route.fulfill({ status: 204 });
  });
  return serverEvents;
}

const withParams = (path: string, params: string) => `${path}${path.includes('?') ? '&' : '?'}${params}`;

test.describe('normalização e hash', () => {
  test('telefone ganha código do país sem duplicar', () => {
    expect(normalizePhone('(11) 99999-8888', '+55')).toBe('5511999998888');
    expect(normalizePhone('(55) 99999-8888', '55')).toBe('5555999998888');
    expect(normalizePhone('+55 11 99999-8888', '55')).toBe('5511999998888');
    expect(normalizePhone('555-0100', '1')).toBe('15550100');
  });

  test('cada plataforma recebe a variante de e-mail que documenta', async () => {
    const hashed = await hashUser({ email: ' Jo.Ao+promo@Gmail.com ', phone: '11999998888' }, '55');
    expect(hashed.em).toBe(sha('jo.ao+promo@gmail.com'));
    // Google: gmail.com/googlemail.com lose dots AND the +suffix; other domains keep both.
    expect(hashed.em_google).toBe(sha('joao@gmail.com'));
    expect((await hashUser({ email: 'Jo.Ao+x@empresa.com' })).em_google).toBe(sha('jo.ao+x@empresa.com'));
    expect(hashed.em_microsoft).toBe(sha('joao@gmail.com'));
    expect(hashed.ph).toBe(sha('5511999998888'));
    expect(hashed.ph_e164).toBe(sha('+5511999998888'));
  });
});

test.describe('relay', () => {
  const host = tracking.hosts.find((name) => !/localhost|127\./.test(name)) ?? 'localhost';
  const base = { event_name: 'Lead', event_id: 'abc12345-event', event_source_url: `https://${host}/?fbclid=XYZ` };

  test('recusa eventos desconhecidos, domínios de fora e dados não hasheados', () => {
    expect(validateEvent({ ...base, event_name: 'Hack' })).toBeNull();
    expect(validateEvent({ ...base, event_source_url: 'https://attacker.example/' })).toBeNull();
    const event = validateEvent({ ...base, user_data: { em: 'plain@example.com', ph: sha('5511999998888') }, custom_data: { value: 10, evil: 'x' } });
    expect(event?.user_data).toEqual({ ph: sha('5511999998888') });
    expect(event?.custom_data).toEqual({ value: 10 });
  });

  test('monta uma requisição por plataforma com token', async () => {
    const event = validateEvent({
      ...base,
      user_data: { em: sha('a@b.com'), external_id: sha('visitor') },
      click_ids: { fbclid: { value: 'XYZ', ts: 1_700_000_000_000 } },
    })!;
    const context: RelayContext = { ip: '203.0.113.9', userAgent: 'UA', cookies: { _fbp: 'fb.1.1.2' }, geo: { country: 'BR' }, now: 1_700_000_100_000 };
    const env = { META_CAPI_TOKEN: 't', TIKTOK_EVENTS_TOKEN: 't', PINTEREST_CONVERSIONS_TOKEN: 't', MICROSOFT_CAPI_TOKEN: 't' };
    const requests = await buildRequests(event, context, env);
    const meta = requests.find((request) => request.platform === 'meta');
    if (tracking.meta.pixelId) {
      const body = JSON.parse(String(meta!.init.body));
      expect(body.data[0]).toMatchObject({
        event_name: 'Lead',
        event_id: 'abc12345-event',
        action_source: 'website',
        user_data: { fbp: 'fb.1.1.2', fbc: 'fb.1.1700000000000.XYZ', em: [sha('a@b.com')], country: [sha('br')] },
      });
    } else {
      expect(meta).toBeUndefined();
    }
    expect(await buildRequests(event, context, {})).toEqual([]);
  });

  test('URLs e referrer são limpos de dado pessoal também no servidor', () => {
    const event = validateEvent({
      ...base,
      event_source_url: `https://${host}/perfil/ana@example.com/?utm_source=x&email=ana@example.com&trk_test_meta=TEST123`,
      referrer_url: 'javascript:alert(1)',
      custom_data: { content_ids: ['sku-1', 'ana@example.com'] },
    })!;
    expect(event.event_source_url).toBe(`https://${host}/perfil/redacted/?utm_source=x`);
    expect(event.referrer_url).toBeUndefined();
    expect(event.custom_data.content_ids).toEqual(['sku-1']);
  });

  test('HTTP 200 com erro por evento é detectado', () => {
    expect(hasIssues('{"num_events_received":1,"num_events_processed":1,"events":[{"status":"processed","error_message":null,"warning_message":null}]}')).toBe(false);
    expect(hasIssues('{"num_events_received":2,"num_events_processed":1,"events":[{"status":"failed","error_message":"bad"}]}')).toBe(true);
    expect(hasIssues('{"events_received":1,"messages":[],"fbtrace_id":"x"}')).toBe(false);
    expect(hasIssues('{"code":0,"message":"OK"}')).toBe(false);
  });

  test('override do Pinterest vale para tag e API juntos', () => {
    expect(pinterestNames('ViewContent', { ViewContent: ['PageVisit', 'page_visit'] })).toEqual(['PageVisit', 'page_visit']);
    expect(pinterestNames('Lead', { Lead: false })).toBe(false);
    expect(pinterestNames('Purchase')).toEqual(['Checkout', 'checkout']);
  });

  test('relay em subdomínio responde CORS só para origens permitidas', async () => {
    const allowed = `https://${host}`;
    const preflight = await handleRelay(new Request('https://track.relay.test/', { method: 'OPTIONS', headers: { Origin: allowed } }), {});
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('Access-Control-Allow-Origin')).toBe(allowed);
    expect(preflight.headers.get('Access-Control-Allow-Credentials')).toBe('true');
    const denied = await handleRelay(new Request('https://track.relay.test/', { method: 'POST', headers: { Origin: 'https://attacker.example' }, body: '{}' }), {});
    expect(denied.status).toBe(403);
  });

  test('IP e geolocalização vêm dos cabeçalhos de cada host', () => {
    const vercel = clientInfo(new Request('https://x.test/', { headers: { 'x-real-ip': '203.0.113.7', 'x-vercel-ip-country': 'BR', 'x-vercel-ip-city': 'S%C3%A3o%20Paulo', 'x-vercel-ip-country-region': 'SP' } }));
    expect(vercel).toEqual({ ip: '203.0.113.7', geo: { city: 'São Paulo', region: 'SP', postalCode: undefined, country: 'BR' } });
    const cloudflare = clientInfo(new Request('https://x.test/', { headers: { 'cf-connecting-ip': '2001:db8::1' } }));
    expect(cloudflare.ip).toBe('2001:db8::1');
  });
});

test('PageView sai no navegador e no relay com o mesmo event_id', async ({ page }) => {
  test.skip(!tracking.meta.pixelId || !tracking.endpoint, 'Meta Pixel ou relay não configurados');
  const serverEvents = await stubVendors(page);
  await page.goto(withParams(PATH, 'trk_enable=1'));
  await expect.poll(() => serverEvents.find((event) => event.event_name === 'PageView')).toBeTruthy();
  const pageView = serverEvents.find((event) => event.event_name === 'PageView')!;
  const calls = await page.evaluate(() => ((window as any).fbq?.queue ?? []).map((args: unknown[]) => Array.from(args)));
  expect(calls).toContainEqual(['track', 'PageView', {}, { eventID: pageView.event_id }]);
  expect(pageView.user_data.external_id).toMatch(/^[a-f0-9]{64}$/);
});

test('track() com usuário envia só hashes ao relay', async ({ page }) => {
  test.skip(!tracking.endpoint, 'relay desativado');
  const serverEvents = await stubVendors(page);
  await page.goto(withParams(PATH, 'trk_enable=1'));
  await page.waitForFunction(() => Boolean((window as any).tracking));
  await page.evaluate(() => (window as any).tracking.track('Lead', { value: 1, currency: 'BRL' }, { email: 'Teste@Example.com', phone: '11999998888' }));
  await expect.poll(() => serverEvents.find((event) => event.event_name === 'Lead')).toBeTruthy();
  const lead = serverEvents.find((event) => event.event_name === 'Lead')!;
  expect(lead.user_data.em).toBe(sha('teste@example.com'));
  expect(JSON.stringify(lead)).not.toContain('Teste@Example.com');
});

test('parâmetros da URL seguem para os links internos e para a próxima página', async ({ page }) => {
  await stubVendors(page);
  await page.goto(withParams(PATH, 'utm_source=trk_test&utm_campaign=c1&gclid=GCLID123&custom_param=ok&email=x@y.com'));
  const internal = page.locator('a[href^="/"]:not([href^="//"]), a[href^="./"]').first();
  test.skip((await internal.count()) === 0, 'página sem link interno');
  const href = await internal.getAttribute('href');
  expect(href).toContain('utm_source=trk_test');
  expect(href).toContain('gclid=GCLID123');
  expect(href).toContain('custom_param=ok');
  expect(href).not.toContain('email=');
  // Next page without parameters still decorates its links from storage.
  await page.goto(PATH);
  const again = await page.locator('a[href^="/"]:not([href^="//"])').first().getAttribute('href');
  expect(again).toContain('utm_campaign=c1');
});

test('navegação sem recarregar (SPA) envia novo PageView quando spa: true', async ({ page }) => {
  test.skip(!tracking.spa || !tracking.endpoint, 'spa desligado ou relay desativado');
  const serverEvents = await stubVendors(page);
  await page.goto(withParams(PATH, 'trk_enable=1'));
  const virtualViews = () => serverEvents.filter((event) => event.event_name === 'PageView' && event.event_source_url.includes('/rota-virtual/')).length;
  await expect.poll(() => serverEvents.some((event) => event.event_name === 'PageView')).toBe(true);
  await page.evaluate(() => history.pushState({}, '', '/rota-virtual/'));
  await expect.poll(virtualViews).toBe(1);
  // Same URL again (e.g. replaceState on hydration) is not a new page.
  await page.evaluate(() => history.replaceState({}, '', '/rota-virtual/'));
  await page.waitForTimeout(300);
  expect(virtualViews()).toBe(1);
});

test('compra com order_id tem event_id estável (recarga não duplica)', async ({ page }) => {
  test.skip(!tracking.endpoint, 'relay desativado');
  const serverEvents = await stubVendors(page);
  await page.goto(withParams(PATH, 'trk_enable=1'));
  await page.waitForFunction(() => Boolean((window as any).tracking));
  const ids = await page.evaluate(async () => [
    await (window as any).tracking.track('Purchase', { value: 10, currency: 'BRL', order_id: 'A-100' }),
    await (window as any).tracking.track('Purchase', { value: 10, currency: 'BRL', order_id: 'A-100' }),
  ]);
  expect(ids[0]).toBe('Purchase-A-100');
  expect(ids[1]).toBe(ids[0]);
  await expect.poll(() => serverEvents.filter((event) => event.event_name === 'Purchase').length).toBe(2);
});

test('navegação interna com ?page=2 não apaga a campanha', async ({ page }) => {
  await stubVendors(page);
  await page.goto(withParams(PATH, 'utm_source=camp&utm_campaign=c9'));
  const internal = page.locator('a[href^="/"]:not([href^="//"])').first();
  test.skip((await internal.count()) === 0, 'página sem link interno');
  // Same-site referrer, no utm/click id: an internal query string.
  await Promise.all([page.waitForURL(/page=2/, { waitUntil: 'load' }), page.evaluate(() => { location.href = '/?page=2'; })]);
  await page.waitForFunction(() => Boolean((window as any).tracking));
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('trk_params') || '{}'));
  expect(stored.last.params).toEqual({ utm_source: 'camp', utm_campaign: 'c9' });
});

test('sem ?trk_enable=1 nada é enviado em localhost', async ({ page }) => {
  const serverEvents = await stubVendors(page);
  await page.goto(PATH);
  await page.waitForTimeout(500);
  expect(serverEvents).toEqual([]);
  expect(await page.evaluate(() => typeof (window as any).fbq)).toBe('undefined');
});
