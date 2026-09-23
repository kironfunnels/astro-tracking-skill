// Tracking regression tests. Vendor scripts are replaced by empty stubs and /api/events is intercepted,
// so nothing reaches Meta, Google, TikTok, Pinterest, Microsoft or LinkedIn during tests.
// Set TRACKING_TEST_PATH to the page that should be exercised (default "/").
import { createHash } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { tracking } from '../src/tracking/config';
import { hashUser, normalizePhone } from '../src/tracking/identity';
import { buildRequests, validateEvent, type RelayContext } from '../src/tracking/server/relay';

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
    expect(hashed.em_google).toBe(sha('joao+promo@gmail.com'));
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

test('sem ?trk_enable=1 nada é enviado em localhost', async ({ page }) => {
  const serverEvents = await stubVendors(page);
  await page.goto(PATH);
  await page.waitForTimeout(500);
  expect(serverEvents).toEqual([]);
  expect(await page.evaluate(() => typeof (window as any).fbq)).toBe('undefined');
});
