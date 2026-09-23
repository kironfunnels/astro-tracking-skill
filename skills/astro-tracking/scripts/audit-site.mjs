#!/usr/bin/env node
// Tracking audit of a live page: which tags are installed, which hits actually leave the browser, which cookies
// exist, whether URL parameters survive navigation, which forms exist and whether any token is exposed.
//
// Usage (from the project root, so Playwright resolves from its node_modules):
//   node <skill>/scripts/audit-site.mjs https://example.com/ [--pages 3] [--json report.json] [--wait 4000] [--static]
//
// Without Playwright installed (or with --static) it falls back to a static HTML scan, which only sees tags
// written in the HTML, not what they send. Nothing is submitted: forms are listed, never filled.
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const target = args.find((arg) => /^https?:\/\//.test(arg));
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
};
if (!target) {
  console.error('Uso: node audit-site.mjs <url> [--pages 3] [--json arquivo.json] [--wait 4000] [--static]');
  process.exit(1);
}
const maxPages = Number(option('pages', 3));
const waitMs = Number(option('wait', 4000));
const jsonOut = option('json');

const TEST_PARAMS = {
  utm_source: 'trk_audit',
  utm_medium: 'audit',
  utm_campaign: 'audit_campaign',
  utm_content: 'audit_content',
  utm_term: 'audit_term',
  fbclid: 'trkAuditFbclid123',
  gclid: 'trkAuditGclid123',
  ttclid: 'trkAuditTtclid123',
  msclkid: '00000000000000000000000000000001',
  custom_param: 'trk_custom',
};

// ---------- signatures ----------

const HTML_SIGNATURES = [
  ['GTM container', /GTM-[A-Z0-9]{4,10}/g],
  ['Google tag (GA4)', /\bG-[A-Z0-9]{8,12}\b/g],
  ['Google Ads', /\bAW-\d{8,12}(?:\/[\w-]+)?/g],
  ['Meta Pixel', /fbq\(\s*['"]init['"]\s*,\s*['"](\d{10,20})['"]/g],
  ['TikTok Pixel', /ttq\.load\(\s*['"]([A-Z0-9]{15,25})['"]/g],
  ['Pinterest tag', /pintrk\(\s*['"]load['"]\s*,\s*['"](\d{8,16})['"]/g],
  ['Microsoft UET', /\bti\s*:\s*['"](\d{5,12})['"]/g],
  ['LinkedIn Insight', /_linkedin_partner_id\s*=\s*['"]?(\d{4,10})/g],
  ['Microsoft Clarity', /clarity\.ms\/tag\/(\w+)/g],
  ['Hotjar', /hjid\s*:\s*(\d+)/g],
  ['Kwai Pixel', /kwaiq\.load\(\s*['"](\w+)['"]/g],
  ['Taboola', /_tfa\.push\(\s*\{[^}]*id\s*:\s*(\d+)/g],
];

// Anything that looks like a server-side secret shipped to the browser is a critical finding.
const SECRET_SIGNATURES = [
  ['Meta access token', /\bEAA[A-Za-z0-9]{60,}/g],
  ['Pinterest token', /\bpina_[A-Za-z0-9]{40,}/g],
  ['GA4 Measurement Protocol api_secret', /api_secret=[\w-]{16,}/g],
  ['access_token in URL', /access_token=[\w.-]{30,}/g],
];

// describe() receives one URLSearchParams per hit: the query string, or each line of a batched POST body.
const HIT_SIGNATURES = [
  ['Meta Pixel', /facebook\.com\/tr\/?(\?|$)/, (params) => `${params.get('ev')} (pixel ${params.get('id')}${params.get('eid') ? ', com eventID' : ', SEM eventID'})`],
  ['Meta CAPI (from browser!)', /graph\.facebook\.com\/v[\d.]+\/\d+\/events/, () => 'CHAMADA DIRETA DO NAVEGADOR — token exposto'],
  ['GA4', /google-analytics\.com\/g\/collect|analytics\.google\.com\/g\/collect/, (params) => `${params.get('en')} (${params.get('tid')})`],
  ['Google Ads', /googleadservices\.com\/pagead\/conversion|googleads\.g\.doubleclick\.net\/pagead\/(viewthrough)?conversion|google\.com\/pagead\/1p-conversion/, (params, url) => url.pathname.split('/').slice(-2).join('/')],
  ['GTM', /googletagmanager\.com\/gtm\.js/, (params) => params.get('id')],
  ['gtag.js', /googletagmanager\.com\/gtag\/js/, (params) => params.get('id')],
  ['TikTok Pixel', /analytics\.tiktok\.com\/api\/v2\/pixel/, () => 'hit'],
  ['Pinterest tag', /ct\.pinterest\.com\/(v3|user)/, (params) => params.get('event') ?? params.get('tid') ?? 'hit'],
  ['Microsoft UET', /bat\.bing\.com\/action/, (params) => `${params.get('evt')} (ti ${params.get('ti')})`],
  ['LinkedIn Insight', /px\.ads\.linkedin\.com\/collect|px\.ads\.linkedin\.com\/wa/, (params) => params.get('pid') ?? 'hit'],
  ['Microsoft Clarity', /clarity\.ms\/collect/, () => 'hit'],
  ['Hotjar', /hotjar\.com|hotjar\.io/, () => 'hit'],
];

const KNOWN_COOKIES = /^(_fbp|_fbc|_ga(_.*)?|_gid|_gcl_(au|aw|gb|gs|dc)|_ttp|ttclid|_epik|_pin_unauth|_uetsid|_uetvid|_uetmsclkid|li_fat_id|_clck|_clsk|_hj.*|trk_.*)$/;

// ---------- helpers ----------

function withTestParams(url) {
  const next = new URL(url);
  for (const [key, value] of Object.entries(TEST_PARAMS)) if (!next.searchParams.has(key)) next.searchParams.set(key, value);
  return next.toString();
}

function scanText(text, signatures) {
  const found = {};
  for (const [name, pattern] of signatures) {
    for (const match of text.matchAll(pattern)) (found[name] ??= new Set()).add(match[1] ?? match[0]);
  }
  return Object.fromEntries(Object.entries(found).map(([name, values]) => [name, [...values]]));
}

async function loadPlaywright() {
  if (args.includes('--static')) return null;
  const require = createRequire(pathToFileURL(`${process.cwd()}/`).href);
  for (const name of ['playwright', '@playwright/test']) {
    try {
      const module = await import(pathToFileURL(require.resolve(name)).href);
      const chromium = module.chromium ?? module.default?.chromium;
      if (chromium) return { chromium };
    } catch {
      /* try the next one */
    }
  }
  return null;
}

// ---------- static fallback ----------

async function staticAudit() {
  const response = await fetch(target, { headers: { 'User-Agent': 'Mozilla/5.0 tracking-audit' } });
  const html = await response.text();
  return {
    mode: 'static',
    url: target,
    status: response.status,
    tagsInHtml: scanText(html, HTML_SIGNATURES),
    exposedSecrets: scanText(html, SECRET_SIGNATURES),
    note: 'Modo estático: só enxerga o que está escrito no HTML. Instale o Playwright (npm i -D @playwright/test && npx playwright install chromium) para ver os disparos reais.',
  };
}

// ---------- browser audit ----------

async function browserAudit({ chromium }) {
  const browser = await chromium.launch({ args: ['--disable-blink-features=AutomationControlled'] });
  // The Meta Pixel silently drops every event from a "HeadlessChrome" user agent; look like regular Chrome.
  const probe = await browser.newPage();
  const userAgent = (await probe.evaluate(() => navigator.userAgent)).replace('HeadlessChrome', 'Chrome');
  await probe.close();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, userAgent, locale: 'pt-BR' });
  const page = await context.newPage();
  const hits = [];
  const postsToSameSite = [];
  const consoleErrors = [];
  const scriptBodies = [];
  const origin = new URL(target).origin;

  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text().slice(0, 300)); });
  page.on('pageerror', (error) => consoleErrors.push(String(error).slice(0, 300)));
  page.on('request', (request) => {
    let url;
    try {
      url = new URL(request.url());
    } catch {
      return;
    }
    for (const [name, pattern, describe] of HIT_SIGNATURES) {
      if (!pattern.test(request.url())) continue;
      const body = request.method() === 'POST' ? request.postData() ?? '' : '';
      let hitParams = [url.searchParams];
      if (body.includes('Content-Disposition: form-data')) {
        // multipart/form-data (the Meta Pixel uses it for larger payloads)
        const params = new URLSearchParams(url.search);
        for (const [, key, value] of body.matchAll(/name="([^"]+)"\r?\n\r?\n([^\r\n]*)/g)) params.append(key, value);
        hitParams = [params];
      } else if (body && !body.startsWith('{')) {
        // urlencoded, one hit per line (GA4 batches several events in one request)
        hitParams = body.split('\n').filter(Boolean).map((line) => new URLSearchParams(`${url.search.slice(1)}&${line}`));
      }
      for (const params of hitParams) hits.push({ platform: name, detail: describe(params, url), page: page.url(), method: request.method() });
    }
    if (url.origin === origin && request.method() === 'POST') {
      postsToSameSite.push({ path: url.pathname, body: (request.postData() ?? '').slice(0, 400) });
    }
  });
  page.on('response', async (response) => {
    const type = response.headers()['content-type'] ?? '';
    if (!/javascript|html/.test(type) || scriptBodies.length > 60) return;
    try {
      scriptBodies.push(await response.text());
    } catch {
      /* body unavailable (redirect, aborted) */
    }
  });

  const landing = withTestParams(target);
  await page.goto(landing, { waitUntil: 'load', timeout: 60_000 });
  await page.waitForTimeout(waitMs);
  // Scroll to the end so scroll/visibility triggers fire.
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += Math.max(400, innerHeight * 0.8)) {
      scrollTo(0, y);
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  });
  await page.waitForTimeout(1500);

  const globals = await page.evaluate(() => {
    const w = window;
    const containers = w.google_tag_manager ? Object.keys(w.google_tag_manager).filter((key) => /^(GTM|G|AW)-/.test(key)) : [];
    const dataLayerEvents = Array.isArray(w.dataLayer)
      ? w.dataLayer.map((entry) => (entry && typeof entry === 'object' && 'event' in entry ? entry.event : entry && entry[0] === 'event' ? `gtag:${entry[1]}` : null)).filter(Boolean)
      : [];
    return {
      fbq: typeof w.fbq === 'function',
      gtag: typeof w.gtag === 'function',
      dataLayer: Array.isArray(w.dataLayer),
      ttq: Boolean(w.ttq),
      pintrk: typeof w.pintrk === 'function',
      uetq: Boolean(w.uetq),
      lintrk: typeof w.lintrk === 'function',
      trackingRuntime: Boolean(w.tracking),
      googleTagManagerContainers: containers,
      dataLayerEvents: [...new Set(dataLayerEvents)].slice(0, 40),
      metaPixelIds: w.fbq?.getState?.().pixels?.map((pixel) => pixel.id) ?? [],
    };
  });

  const html = await page.content();
  const hostname = new URL(target).hostname;
  const twoLevel = /\.(com|net|org|gov|edu|co)\.[a-z]{2}$|\.(pages\.dev|workers\.dev|vercel\.app|netlify\.app|github\.io)$/.test(hostname);
  const siteHost = /^[\d.]+$/.test(hostname) || !hostname.includes('.') ? hostname : hostname.split('.').slice(twoLevel ? -3 : -2).join('.');
  const linkReport = await page.evaluate(([params, host]) => {
    const keys = Object.keys(params);
    const links = [...document.querySelectorAll('a[href]')].map((a) => a.href).filter((href) => /^https?:/.test(href));
    const internal = links.filter((href) => new URL(href).hostname.endsWith(host) && !new URL(href).hash);
    const decorated = internal.filter((href) => keys.every((key) => new URL(href).searchParams.has(key)));
    const partial = internal.filter((href) => !decorated.includes(href) && keys.some((key) => new URL(href).searchParams.has(key)));
    const external = links.filter((href) => !new URL(href).hostname.endsWith(host));
    return {
      internalLinks: internal.length,
      fullyDecorated: decorated.length,
      partiallyDecorated: partial.length,
      notDecoratedSample: internal.filter((href) => !decorated.includes(href)).slice(0, 8),
      externalHostsSample: [...new Set(external.map((href) => new URL(href).hostname))].slice(0, 15),
    };
  }, [TEST_PARAMS, siteHost]);

  const forms = await page.evaluate(() => [...document.querySelectorAll('form')].map((form) => ({
    id: form.id || null,
    action: form.getAttribute('action'),
    method: (form.getAttribute('method') || 'get').toLowerCase(),
    fields: [...form.elements].filter((el) => el.name).map((el) => `${el.name}${el.type === 'hidden' ? `(hidden=${el.value || 'vazio'})` : `:${el.type}`}`),
  })));
  const iframes = await page.evaluate(() => [...document.querySelectorAll('iframe[src]')].map((frame) => frame.src.slice(0, 200)));

  // Follow internal links (same tab, no params in the typed URL) to prove the parameters persist across pages.
  const navigation = [];
  const toVisit = await page.evaluate((host) => [...new Set([...document.querySelectorAll('a[href]')]
    .map((a) => a.href)
    .filter((href) => /^https?:/.test(href) && new URL(href).hostname.endsWith(host) && !new URL(href).hash && new URL(href).pathname !== location.pathname))], siteHost);
  for (const href of toVisit.slice(0, maxPages)) {
    const clean = new URL(href);
    for (const key of Object.keys(TEST_PARAMS)) clean.searchParams.delete(key);
    await page.goto(clean.toString(), { waitUntil: 'load', timeout: 60_000 }).catch(() => {});
    await page.waitForTimeout(1500);
    const carried = await page.evaluate(([params, host]) => {
      const links = [...document.querySelectorAll('a[href]')].map((a) => a.href).filter((h) => /^https?:/.test(h) && new URL(h).hostname.endsWith(host) && !new URL(h).hash);
      const withParams = links.filter((h) => new URL(h).searchParams.get('utm_campaign') === params.utm_campaign);
      return { links: links.length, withParams: withParams.length };
    }, [TEST_PARAMS, siteHost]);
    navigation.push({ linkDecorated: new URL(href).searchParams.get('utm_campaign') === TEST_PARAMS.utm_campaign, visited: clean.toString(), ...carried });
  }

  const cookies = (await context.cookies()).filter((cookie) => KNOWN_COOKIES.test(cookie.name)).map((cookie) => ({ name: cookie.name, domain: cookie.domain, value: cookie.value.slice(0, 60) }));
  await browser.close();

  const byPlatform = {};
  for (const hit of hits) (byPlatform[hit.platform] ??= new Set()).add(hit.detail);

  return {
    mode: 'browser',
    url: landing,
    tagsInHtml: scanText(html, HTML_SIGNATURES),
    globals,
    hits: Object.fromEntries(Object.entries(byPlatform).map(([name, set]) => [name, [...set].slice(0, 30)])),
    firstPartyPosts: postsToSameSite.slice(0, 20),
    cookies,
    params: { ...linkReport, navigation },
    forms,
    iframes,
    exposedSecrets: scanText([html, ...scriptBodies].join('\n'), SECRET_SIGNATURES),
    consoleErrors: [...new Set(consoleErrors)].slice(0, 20),
  };
}

// ---------- findings ----------

function findings(report) {
  const out = [];
  const secrets = Object.keys(report.exposedSecrets ?? {});
  if (secrets.length) out.push(`CRÍTICO: possível segredo exposto no navegador (${secrets.join(', ')}). Revogue o token e mova-o para um secret da Cloudflare.`);
  if (report.hits?.['Meta CAPI (from browser!)']) out.push('CRÍTICO: a página chama graph.facebook.com direto do navegador; o token da API de Conversões está público.');
  const tags = report.tagsInHtml ?? {};
  if (tags['GTM container'] && (tags['Meta Pixel'] || report.globals?.metaPixelIds?.length) && report.globals?.googleTagManagerContainers?.length) {
    out.push('ATENÇÃO: há GTM e Pixel da Meta ao mesmo tempo. Confirme que o Pixel não está também dentro do contêiner (evento em dobro).');
  }
  const pixelIds = report.globals?.metaPixelIds ?? [];
  if (new Set(pixelIds).size > 1) out.push(`ATENÇÃO: mais de um Pixel da Meta ativo (${[...new Set(pixelIds)].join(', ')}). Verifique se algum vem do provedor do formulário.`);
  const metaHits = report.hits?.['Meta Pixel'] ?? [];
  const pageViews = metaHits.filter((detail) => detail.startsWith('PageView'));
  if (pageViews.length > 1 && new Set(pageViews).size < pageViews.length) out.push('ATENÇÃO: PageView da Meta repetido na mesma página.');
  const withoutId = metaHits.filter((detail) => detail.includes('SEM eventID'));
  if (withoutId.length) out.push(`Eventos do Pixel sem eventID (${withoutId.join('; ')}): não há como deduplicar com a API de Conversões.`);
  if (report.mode === 'browser') {
    if (!report.cookies.some((cookie) => cookie.name === '_fbc') && metaHits.length) out.push('Chegou com fbclid e nenhum _fbc foi criado: a atribuição de clique da Meta se perde.');
    if (report.hits?.GA4 && !report.cookies.some((cookie) => cookie.name.startsWith('_gcl_aw')) && report.hits['Google Ads']) out.push('Chegou com gclid e nenhum _gcl_aw foi criado (conferir consentimento/conversion linker).');
    const { internalLinks, fullyDecorated, navigation } = report.params;
    if (internalLinks && fullyDecorated < internalLinks) out.push(`Parâmetros: ${fullyDecorated}/${internalLinks} links internos carregam todos os parâmetros de teste.`);
    if (navigation.some((step) => step.links && !step.withParams)) out.push('Parâmetros se perdem na segunda página (não há persistência além da URL de entrada).');
    if (report.iframes.length) out.push(`Há ${report.iframes.length} iframe(s): formulários dentro de iframe de outro domínio não podem ser lidos pela página.`);
    if (report.consoleErrors.length) out.push(`${report.consoleErrors.length} erro(s) no console.`);
  }
  if (!out.length) out.push('Nenhum problema automático encontrado. Revise os detalhes abaixo manualmente.');
  return out;
}

function printMarkdown(report) {
  const lines = [`# Auditoria de rastreamento`, '', `URL: ${report.url}`, `Modo: ${report.mode}`, '', '## Achados', ...findings(report).map((item) => `- ${item}`), ''];
  const section = (title, value) => {
    lines.push(`## ${title}`, '```json', JSON.stringify(value, null, 2), '```', '');
  };
  section('Tags no HTML', report.tagsInHtml);
  if (report.mode === 'browser') {
    section('Objetos globais e contêineres', report.globals);
    section('Disparos observados na rede', report.hits);
    section('POSTs para o próprio domínio (relay/CAPI?)', report.firstPartyPosts);
    section('Cookies de rastreamento', report.cookies);
    section('Persistência de parâmetros', report.params);
    section('Formulários', report.forms);
    section('Iframes', report.iframes);
    section('Erros de console', report.consoleErrors);
  }
  section('Segredos expostos', report.exposedSecrets);
  if (report.note) lines.push(`> ${report.note}`);
  console.log(lines.join('\n'));
}

const playwright = await loadPlaywright();
const report = playwright ? await browserAudit(playwright) : await staticAudit();
report.findings = findings(report);
printMarkdown(report);
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(report, null, 2));
