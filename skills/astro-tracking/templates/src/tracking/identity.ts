// Normalization and SHA-256 hashing of customer information, shared by the browser and the relay.
// Every platform normalizes a little differently, so the browser hashes each variant once and
// plaintext never leaves the page except inside the vendors' own pixels (which hash it themselves).
//   Meta:      em trimmed+lowercase; ph digits with country code, no "+"; fn/ln/ct lowercase letters; st/country 2 letters.
//   Google:    email lowercase, dots removed from gmail.com/googlemail.com local part; phone E.164 with "+".
//   TikTok:    email lowercase; phone E.164 with "+".
//   Microsoft: email lowercase, dots and "+alias" removed from the local part (any domain); phone E.164 with "+".
//   Pinterest: same rules as Meta.

export interface UserInput {
  email?: string;
  phone?: string;
  /** Calling code for phone numbers typed without one, e.g. "55" or "+55". */
  countryCode?: string;
  firstName?: string;
  lastName?: string;
  city?: string;
  state?: string;
  zip?: string;
  /** ISO 3166-1 alpha-2 */
  country?: string;
}

/** Only SHA-256 hex digests. Safe to keep in localStorage and to post to the relay. */
export interface HashedIdentity {
  em?: string;
  em_google?: string;
  em_microsoft?: string;
  ph?: string;
  ph_e164?: string;
  fn?: string;
  ln?: string;
  ct?: string;
  st?: string;
  zp?: string;
  country?: string;
  external_id?: string;
}

export const HASHED_KEYS = ['em', 'em_google', 'em_microsoft', 'ph', 'ph_e164', 'fn', 'ln', 'ct', 'st', 'zp', 'country', 'external_id'] as const;

const SHA256_HEX = /^[a-f0-9]{64}$/;
export const isSha256 = (value: unknown): value is string => typeof value === 'string' && SHA256_HEX.test(value);

export async function sha256(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export const normalizeEmail = (value: string) => value.trim().toLowerCase();

function splitEmail(value: string) {
  const email = normalizeEmail(value);
  const at = email.lastIndexOf('@');
  return at > 0 ? { local: email.slice(0, at), domain: email.slice(at + 1) } : null;
}

export function normalizeEmailGoogle(value: string) {
  const parts = splitEmail(value);
  if (!parts) return normalizeEmail(value);
  const local = parts.domain === 'gmail.com' || parts.domain === 'googlemail.com' ? parts.local.replace(/\./g, '') : parts.local;
  return `${local}@${parts.domain}`;
}

export function normalizeEmailMicrosoft(value: string) {
  const parts = splitEmail(value);
  if (!parts) return normalizeEmail(value);
  return `${parts.local.split('+')[0].replace(/\./g, '')}@${parts.domain}`;
}

/** Digits with country code and no "+", e.g. 5511999998888. */
export function normalizePhone(value: string, countryCode = '55'): string {
  const raw = value.trim();
  let digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  if (raw.startsWith('+')) return digits;
  if (raw.startsWith('00')) return digits.replace(/^00/, '');
  digits = digits.replace(/^0+/, '');
  const cc = countryCode.replace(/\D/g, '');
  if (!cc) return digits;
  // Brazilian national numbers (area code + number) have at most 11 digits; area code 55 exists, so length decides.
  if (cc === '55') return digits.length <= 11 ? cc + digits : digits;
  return digits.startsWith(cc) ? digits : cc + digits;
}

export const normalizeName = (value: string) =>
  value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');
export const normalizeCode = (value: string) => value.trim().toLowerCase().replace(/[^a-z]/g, '').slice(0, 2);
export const normalizeZip = (value: string) => value.trim().toLowerCase().replace(/[\s-]/g, '');

async function hashWith(value: string | undefined, normalize: (input: string) => string) {
  if (!value || !value.trim()) return undefined;
  const trimmed = value.trim().toLowerCase();
  if (isSha256(trimmed)) return trimmed;
  const normalized = normalize(value);
  return normalized ? sha256(normalized) : undefined;
}

export async function hashUser(input: UserInput, defaultCountryCode = '55'): Promise<HashedIdentity> {
  const phone = input.phone ? normalizePhone(input.phone, input.countryCode ?? defaultCountryCode) : '';
  const pairs: [keyof HashedIdentity, Promise<string | undefined> | undefined][] = [
    ['em', hashWith(input.email, normalizeEmail)],
    ['em_google', hashWith(input.email, normalizeEmailGoogle)],
    ['em_microsoft', hashWith(input.email, normalizeEmailMicrosoft)],
    ['ph', phone ? sha256(phone) : undefined],
    ['ph_e164', phone ? sha256(`+${phone}`) : undefined],
    ['fn', hashWith(input.firstName, normalizeName)],
    ['ln', hashWith(input.lastName, normalizeName)],
    ['ct', hashWith(input.city, normalizeName)],
    ['st', hashWith(input.state, normalizeCode)],
    ['zp', hashWith(input.zip, normalizeZip)],
    ['country', hashWith(input.country, normalizeCode)],
  ];
  const values = await Promise.all(pairs.map(([, promise]) => promise));
  const result: HashedIdentity = {};
  pairs.forEach(([key], index) => {
    if (values[index]) result[key] = values[index];
  });
  return result;
}

/** Keeps only well-formed digests (the relay never trusts anything else from the browser). */
export function pickHashed(input: unknown): HashedIdentity {
  if (!input || typeof input !== 'object') return {};
  const source = input as Record<string, unknown>;
  const result: HashedIdentity = {};
  for (const key of HASHED_KEYS) if (isSha256(source[key])) result[key] = source[key] as string;
  return result;
}
