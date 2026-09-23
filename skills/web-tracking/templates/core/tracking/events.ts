// Canonical event catalog. Pages call track() with Meta's standard names; each platform receives its own name.
// false = the platform has no equivalent and the event is not sent there.
// Sources (checked 2026-09): Meta Pixel reference, GA4 recommended events, TikTok standard events,
// Pinterest tag/Conversions API event names, Microsoft UET recommended event actions.

interface PlatformNames {
  ga4: string | false;
  tiktok: string | false;
  /** [pintrk tag event, Conversions API event_name], per Pinterest's "Name in Tag" / "Name in API" table */
  pinterest: [string, string] | false;
  microsoft: string | false;
}

export const EVENTS = {
  PageView: { ga4: false, tiktok: false, pinterest: false, microsoft: false }, // each tag records page views on load
  ViewContent: { ga4: 'view_item', tiktok: 'ViewContent', pinterest: ['ViewContent', 'view_content'], microsoft: 'view_item' },
  Search: { ga4: 'search', tiktok: 'Search', pinterest: ['Search', 'search'], microsoft: 'search' },
  AddToCart: { ga4: 'add_to_cart', tiktok: 'AddToCart', pinterest: ['AddToCart', 'add_to_cart'], microsoft: 'add_to_cart' },
  AddToWishlist: { ga4: 'add_to_wishlist', tiktok: 'AddToWishlist', pinterest: ['AddToWishList', 'add_to_wishlist'], microsoft: 'add_to_wishlist' },
  InitiateCheckout: { ga4: 'begin_checkout', tiktok: 'InitiateCheckout', pinterest: ['InitiateCheckout', 'initiate_checkout'], microsoft: 'begin_checkout' },
  AddPaymentInfo: { ga4: 'add_payment_info', tiktok: 'AddPaymentInfo', pinterest: ['AddPaymentInfo', 'add_payment_info'], microsoft: 'add_payment_info' },
  Purchase: { ga4: 'purchase', tiktok: 'Purchase', pinterest: ['Checkout', 'checkout'], microsoft: 'purchase' },
  Lead: { ga4: 'generate_lead', tiktok: 'SubmitForm', pinterest: ['Lead', 'lead'], microsoft: 'submit_lead_form' },
  CompleteRegistration: { ga4: 'sign_up', tiktok: 'CompleteRegistration', pinterest: ['SignUp', 'signup'], microsoft: 'sign_up' },
  Contact: { ga4: 'contact', tiktok: 'Contact', pinterest: ['Contact', 'contact'], microsoft: 'contact' },
  Schedule: { ga4: 'schedule', tiktok: 'Schedule', pinterest: ['Schedule', 'schedule'], microsoft: 'book_appointment' },
  Subscribe: { ga4: 'subscribe', tiktok: 'Subscribe', pinterest: ['Subscribe', 'subscribe'], microsoft: 'subscribe' },
  StartTrial: { ga4: 'start_trial', tiktok: 'StartTrial', pinterest: ['StartTrial', 'start_trial'], microsoft: 'start_trial' },
  SubmitApplication: { ga4: 'submit_application', tiktok: 'SubmitApplication', pinterest: ['SubmitApplication', 'submit_application'], microsoft: 'submit_application' },
} satisfies Record<string, PlatformNames>;

export type EventName = keyof typeof EVENTS;

export const isStandardEvent = (name: string): name is EventName => Object.hasOwn(EVENTS, name);

/** Parameters accepted by track(). Names follow Meta's object properties; each platform gets them translated. */
export interface EventData {
  value?: number;
  currency?: string;
  content_name?: string;
  content_category?: string;
  content_ids?: string[];
  content_type?: 'product' | 'product_group';
  contents?: { id: string; quantity: number; item_price?: number; name?: string }[];
  num_items?: number;
  search_string?: string;
  order_id?: string;
  predicted_ltv?: number;
  status?: string;
  /** Anything else is forwarded to the browser pixels as-is and dropped by the server relay. */
  [key: string]: unknown;
}

/** Keys the server relay forwards. Everything else stays browser-only. */
export const SERVER_DATA_KEYS = [
  'value', 'currency', 'content_name', 'content_category', 'content_ids', 'content_type',
  'contents', 'num_items', 'search_string', 'order_id', 'predicted_ltv', 'status', 'percent_scrolled',
] as const;

/** Name override from config wins over the catalog. */
export function platformName(
  name: string,
  platform: keyof PlatformNames,
  overrides: Partial<Record<string, string | false>> = {},
): string | false {
  if (name in overrides) return overrides[name] ?? false;
  if (!isStandardEvent(name)) return false;
  const mapped = EVENTS[name][platform];
  return Array.isArray(mapped) ? mapped[0] : mapped;
}

/** Pinterest override: false, one name for tag and API (custom events), or [tag, api]. */
export type PinterestName = string | false | [string, string];

export function pinterestNames(name: string, overrides: Partial<Record<string, PinterestName>> = {}): [string, string] | false {
  if (name in overrides) {
    const value = overrides[name] ?? false;
    return value === false ? false : Array.isArray(value) ? value : [value, value];
  }
  if (!isStandardEvent(name)) return false;
  return EVENTS[name].pinterest;
}

/** GA4 recommended-event parameters. */
export function toGa4(data: EventData, eventId: string) {
  const { contents, order_id, search_string, content_ids, content_name, content_category, content_type, num_items, predicted_ltv, ...rest } = data;
  const items = contents?.map((item) => ({ item_id: item.id, item_name: item.name, quantity: item.quantity, price: item.item_price }))
    ?? content_ids?.map((id) => ({ item_id: id }));
  return clean({
    ...rest,
    items,
    transaction_id: order_id,
    search_term: search_string,
    content_name,
    content_category,
    event_id: eventId,
  });
}

export function toTikTok(data: EventData) {
  return clean({
    value: data.value,
    currency: data.currency,
    content_type: data.content_type ?? (data.contents || data.content_ids ? 'product' : undefined),
    contents: data.contents?.map((item) => ({ content_id: item.id, quantity: item.quantity, price: item.item_price, content_name: item.name }))
      ?? data.content_ids?.map((id) => ({ content_id: id })),
    query: data.search_string,
    description: data.content_name,
    order_id: data.order_id,
  });
}

export function toPinterestTag(data: EventData) {
  return clean({
    value: data.value,
    currency: data.currency,
    order_id: data.order_id,
    order_quantity: data.num_items,
    search_query: data.search_string,
    line_items: data.contents?.map((item) => ({ product_id: item.id, product_quantity: item.quantity, product_price: item.item_price, product_name: item.name })),
  });
}

export function clean<T extends Record<string, unknown>>(object: T): T {
  for (const key of Object.keys(object)) if (object[key] === undefined) delete object[key];
  return object;
}
