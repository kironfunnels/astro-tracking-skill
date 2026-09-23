#!/usr/bin/env node
// Recovers conversions the site failed to send (e.g. Leads lost to a broken trigger) by uploading them to the Meta
// Conversions API from an export of the form/CRM provider. See references/troubleshooting.md before using it.
//
//   node backfill-meta.mjs --file contatos.csv --pixel <PIXEL_ID> --url https://site.com/lp/ \
//     --map "email=E-mail,phone=Telefone,created_at=Data de cadastro,fbclid=fbclid,first_name=Nome" \
//     --after 2026-09-20T00:00-03:00 --before 2026-09-23T14:00-03:00 [--event Lead] [--country 55] [--tz -03:00] \
//     [--test-code TEST12345] [--send]
//
// Default is a dry run that prints the payload with hashes. --send needs META_CAPI_TOKEN in the environment of the
// shell that runs the command (never in a file, never pasted into a chat):
//   PowerShell: $env:META_CAPI_TOKEN = [Net.NetworkCredential]::new("", (Read-Host -AsSecureString)).Password; node backfill-meta.mjs ... --send
//   bash:       read -rs META_CAPI_TOKEN && export META_CAPI_TOKEN && node backfill-meta.mjs ... --send
//
// Rules that matter (learned in production):
// - action_source is always "website": with "other" the events do not count for campaigns optimizing a website event.
// - event_time must be within the last 7 days (older rows are skipped; one bad row would reject the whole batch).
// - --before must be the moment the live fix was deployed: contacts after it already reached Meta live with a
//   different event_id and would be counted twice.
// - event_id is stable per contact (<event>-<hash>), so re-running the script never duplicates.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const GRAPH_VERSION = 'v26.0';
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
};
const file = option('file');
const pixel = option('pixel');
const sourceUrl = option('url');
if (!file || !pixel || !sourceUrl) {
  console.error('Uso: node backfill-meta.mjs --file contatos.csv --pixel <ID> --url <landing> --map "email=Coluna,..." [--after ISO] [--before ISO] [--send]');
  process.exit(1);
}
const eventName = option('event', 'Lead');
const countryCode = option('country', '55');
const defaultTz = option('tz', '-03:00');
const testCode = option('test-code');
const send = args.includes('--send');
const after = option('after') ? Date.parse(option('after')) : 0;
const before = option('before') ? Date.parse(option('before')) : Date.now();
const map = Object.fromEntries((option('map', 'email=email,phone=phone,created_at=created_at,fbclid=fbclid')).split(',').map((pair) => pair.split('=').map((part) => part.trim())));

// ---------- CSV / JSON ----------

function parseCsv(text) {
  const firstLine = text.split(/\r?\n/, 1)[0];
  const delimiter = (firstLine.match(/;/g) ?? []).length > (firstLine.match(/,/g) ?? []).length ? ';' : ',';
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === delimiter) { row.push(field); field = ''; }
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += char;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [header, ...data] = rows.filter((cells) => cells.some((cell) => cell.trim()));
  return data.map((cells) => Object.fromEntries(header.map((name, index) => [name.trim().replace(/^\uFEFF/, ''), (cells[index] ?? '').trim()])));
}

const raw = readFileSync(file, 'utf8');
const records = file.endsWith('.json') ? JSON.parse(raw) : parseCsv(raw);
const get = (record, key) => (map[key] ? record[map[key]] : record[key]) || undefined;

// ---------- normalization (same rules as templates/core/tracking/identity.ts) ----------

const sha = (value) => createHash('sha256').update(value).digest('hex');
const normalizeEmail = (value) => value.trim().toLowerCase();
const normalizeName = (value) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z]/g, '');
function normalizePhone(value, cc = '55') {
  const rawValue = value.trim();
  let digits = rawValue.replace(/\D/g, '');
  if (!digits) return '';
  if (rawValue.startsWith('+')) return digits;
  if (rawValue.startsWith('00')) return digits.replace(/^00/, '');
  digits = digits.replace(/^0+/, '');
  const code = cc.replace(/\D/g, '');
  if (code === '55') return digits.length <= 11 ? code + digits : digits;
  return digits.startsWith(code) ? digits : code + digits;
}

/** ISO dates, or dd/mm/yyyy [hh:mm[:ss]] in the --tz offset (typical Brazilian exports). */
function parseDate(value) {
  if (!value) return NaN;
  const br = value.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (br) {
    const [, d, m, y, hh = '12', mm = '00', ss = '00'] = br;
    return Date.parse(`${y}-${m}-${d}T${hh}:${mm}:${ss}${defaultTz}`);
  }
  return Date.parse(/[zZ]|[+-]\d{2}:?\d{2}$/.test(value) || !value.includes('T') ? value : `${value}${defaultTz}`);
}

// ---------- build ----------

const now = Date.now();
const events = [];
const skipped = [];
for (const [index, record] of records.entries()) {
  const email = get(record, 'email');
  const phone = get(record, 'phone');
  const createdAt = parseDate(get(record, 'created_at'));
  const reason =
    !email && !phone ? 'sem e-mail e telefone'
    : Number.isNaN(createdAt) ? 'data inválida'
    : createdAt < after ? 'antes de --after'
    : createdAt >= before ? 'depois de --before (já enviado ao vivo)'
    : now - createdAt > 7 * 86_400_000 - 3_600_000 ? 'mais de 7 dias (a Meta recusa)'
    : null;
  if (reason) { skipped.push(`linha ${index + 2}: ${reason}`); continue; }

  const em = email ? sha(normalizeEmail(email)) : undefined;
  const phoneDigits = phone ? normalizePhone(phone, get(record, 'ddi') ?? countryCode) : '';
  const ph = phoneDigits ? sha(phoneDigits) : undefined;
  const firstName = get(record, 'first_name');
  const lastName = get(record, 'last_name');
  const fbclid = get(record, 'fbclid');
  const identityKey = em ?? ph;
  const user_data = {
    em: em ? [em] : undefined,
    ph: ph ? [ph] : undefined,
    fn: firstName && normalizeName(firstName.split(/\s+/)[0]) ? [sha(normalizeName(firstName.split(/\s+/)[0]))] : undefined,
    ln: lastName && normalizeName(lastName) ? [sha(normalizeName(lastName))] : undefined,
    external_id: [identityKey],
    // fbclid exactly as the provider stored it (case-sensitive, never modified), with the signup time.
    fbc: fbclid ? `fb.1.${createdAt}.${fbclid}` : undefined,
  };
  const custom_data = Object.fromEntries(Object.keys(map)
    .filter((key) => key.startsWith('utm_') && get(record, key))
    .map((key) => [key, get(record, key)]));
  events.push(JSON.parse(JSON.stringify({
    event_name: eventName,
    event_time: Math.floor(createdAt / 1000),
    event_id: `${eventName.toLowerCase()}-${identityKey.slice(0, 32)}`,
    event_source_url: get(record, 'url') ?? sourceUrl,
    action_source: 'website',
    user_data,
    custom_data: Object.keys(custom_data).length ? custom_data : undefined,
  })));
}

console.log(`${records.length} linhas · ${events.length} eventos · ${skipped.length} ignoradas`);
for (const line of skipped.slice(0, 30)) console.log(`  - ${line}`);

if (!send) {
  console.log('\nSimulação (nada enviado). Primeiro evento:');
  console.log(JSON.stringify(events[0] ?? null, null, 2));
  console.log('\nRevise e rode de novo com --send (e de preferência antes com --test-code).');
  process.exit(0);
}

const token = process.env.META_CAPI_TOKEN;
if (!token) {
  console.error('Defina META_CAPI_TOKEN no ambiente deste terminal (ver cabeçalho do script).');
  process.exit(1);
}
for (let start = 0; start < events.length; start += 500) {
  const payload = { data: events.slice(start, start + 500), ...(testCode ? { test_event_code: testCode } : {}) };
  const response = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${pixel}/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, access_token: token }),
  });
  const body = await response.text();
  console.log(`lote ${start / 500 + 1}: HTTP ${response.status} ${body.slice(0, 500)}`);
  if (!response.ok) process.exit(1);
}
