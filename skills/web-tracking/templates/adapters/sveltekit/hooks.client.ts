// SvelteKit: src/hooks.client.ts runs once when the app starts in the browser.
// Copy core/tracking to src/lib/tracking and set `spa: true` in its config.ts (client-side navigation).
import '$lib/tracking/client';
