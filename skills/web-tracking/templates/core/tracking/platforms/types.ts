import type { EventData } from '../events';
import type { HashedIdentity } from '../identity';

export interface TrackedEvent {
  name: string;
  standard: boolean;
  data: EventData;
  eventId: string;
  identity: HashedIdentity;
}

export interface BrowserPlatform {
  name: string;
  enabled(): boolean;
  /** Installs the vendor tag. Called once, after consent when consent is required. */
  load(identity: HashedIdentity): void;
  /** Called when the page learns who the visitor is (form submit, login). */
  identify?(identity: HashedIdentity): void;
  track(event: TrackedEvent): void;
  /** Virtual page view after a client-side route change (tags whose page call carries no event_id). */
  page?(): void;
}

export function loadScript(src: string) {
  const script = document.createElement('script');
  script.async = true;
  script.src = src;
  document.head.appendChild(script);
  return script;
}
