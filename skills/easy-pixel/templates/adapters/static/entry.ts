// Bundle entry for sites without a JavaScript build (plain HTML, WordPress, Elementor, Webflow, Wix custom code).
// Build a single file with scripts/build-bundle.mjs and load it with <script src="/tracking.js" defer></script>.
// Everything is exposed on window: window.tracking (runtime API) and window.trackingForms.capture(options)
// for embedded forms that submit with fetch (see references/forms.md).
import './tracking/client';
import { captureFormSubmissions } from './tracking/form-capture';

declare global {
  interface Window { trackingForms?: { capture: typeof captureFormSubmissions } }
}

window.trackingForms = { capture: captureFormSubmissions };
