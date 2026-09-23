// Conversion capture for embedded forms that submit with fetch() (third-party form builders, CRM widgets).
// Why not the success message or the submit click?
//   - Many providers redirect after a successful submit (thank-you page, WhatsApp group). The success message never
//     shows and a DOM-based trigger silently loses every Lead.
//   - A submit/click trigger also counts attempts that the provider rejected (invalid phone, duplicate email).
// Reading the provider's own request and response is the one signal that is right in both cases. The response is
// held back (up to holdMs) until the events leave, so a redirect cannot cut them off.
// Limitation: forms rendered inside an iframe from another origin cannot be observed; use the provider's
// thank-you page or its own webhook/CAPI integration instead (see references/forms.md).
import type { EventData } from './events';
import type { UserInput } from './identity';

export interface FormCaptureOptions {
  /** Matches the provider's submit request, e.g. /\/api\/forms\/my-org\/my-form\//. Only POSTs are considered. */
  match: RegExp;
  /** Decides whether the parsed JSON response is a confirmed submission. Default: response.ok and no `error` field. */
  isSuccess?: (json: Record<string, unknown> | null, response: Response) => boolean;
  /** Turns the request body into the event. Return null to skip. */
  map: (body: Record<string, unknown>) => { name?: string; data?: EventData; user?: UserInput } | null;
  /** Longest time the page waits for tracking before handing the response back (default 1500 ms). */
  holdMs?: number;
}

type Api = { track: (name: string, data?: EventData, user?: UserInput) => Promise<string> };

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function whenTrackingReady(): Promise<Api> {
  return new Promise((resolve) => {
    const queue = (window.trackingQueue = window.trackingQueue || []);
    queue.push((api) => resolve(api));
  });
}

async function requestBody(input: RequestInfo | URL, init?: RequestInit) {
  if (init?.body !== undefined && init.body !== null) return parseBody(init.body);
  // fetch(new Request(url, { body })) carries the body inside the Request.
  if (input instanceof Request) {
    try {
      return parseBody(await input.clone().text());
    } catch {
      return null;
    }
  }
  return null;
}

function parseBody(body: BodyInit | null | undefined): Record<string, unknown> | null {
  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch {
      return Object.fromEntries(new URLSearchParams(body));
    }
  }
  if (body instanceof URLSearchParams) return Object.fromEntries(body);
  if (body instanceof FormData) return Object.fromEntries([...body].filter(([, value]) => typeof value === 'string'));
  return null;
}

export function captureFormSubmissions(options: FormCaptureOptions) {
  const original = window.fetch.bind(window);
  const holdMs = options.holdMs ?? 1500;
  const isSuccess = options.isSuccess ?? ((json, response) => response.ok && !(json && 'error' in json && json.error));

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
    // A /g or /y regex keeps state between test() calls; reset it so every request is judged alone.
    options.match.lastIndex = 0;
    const matches = method === 'POST' && options.match.test(url);
    const bodyPromise = matches ? requestBody(input, init) : null; // read before the Request body is consumed
    const response = await original(input, init);
    if (!matches) return response;

    try {
      const body = await bodyPromise;
      let json: Record<string, unknown> | null = null;
      try {
        json = await response.clone().json();
      } catch {
        /* not JSON: rely on the status code */
      }
      if (!body || !isSuccess(json, response)) return response;
      const event = options.map(body);
      if (!event) return response;
      const sent = whenTrackingReady()
        .then((api) => api.track(event.name ?? 'Lead', event.data ?? {}, event.user))
        .then(() => wait(300)); // let the pixel beacons leave before a possible redirect
      await Promise.race([sent, wait(holdMs)]);
    } catch (error) {
      console.error('[tracking] form capture', error);
    }
    return response;
  };
}
