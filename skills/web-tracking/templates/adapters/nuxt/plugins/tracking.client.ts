// Nuxt: plugins/tracking.client.ts (app/plugins/ in Nuxt 4). ".client" keeps it out of SSR.
// Copy core/tracking to the directory the alias points to (Nuxt 4: app/tracking or shared/tracking) and set
// `spa: true` in tracking/config.ts so route changes send PageView.
export default defineNuxtPlugin(() => {
  import('~/tracking/client');
});
