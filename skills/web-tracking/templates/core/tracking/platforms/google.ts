// Google tag (gtag.js) for GA4 and Google Ads, without GTM.
// GA4 events: https://developers.google.com/analytics/devguides/collection/ga4/reference/events
// Ads conversions + enhanced conversions: https://support.google.com/google-ads/answer/13258081
// Consent Mode v2: https://developers.google.com/tag-platform/security/guides/consent
import { tracking } from '../config';
import { platformName, toGa4 } from '../events';
import type { HashedIdentity } from '../identity';
import { loadScript, type BrowserPlatform } from './types';

declare global {
  interface Window { dataLayer: unknown[]; gtag: (...args: unknown[]) => void }
}

function ensureGtag() {
  window.dataLayer = window.dataLayer || [];
  if (typeof window.gtag === 'function') return;
  window.gtag = function gtag() {
    // gtag.js expects the arguments object itself.
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer.push(arguments);
  };
}

const consentState = (granted: boolean) => {
  const state = granted ? 'granted' : 'denied';
  return { ad_storage: state, ad_user_data: state, ad_personalization: state, analytics_storage: state };
};

/** Consent Mode v2 defaults must be queued before any config command. */
export function googleConsentDefault(granted: boolean) {
  ensureGtag();
  window.gtag('consent', 'default', { ...consentState(granted), wait_for_update: 500 });
}

export function googleConsentUpdate(granted: boolean) {
  window.gtag?.('consent', 'update', consentState(granted));
}

function userData(identity: HashedIdentity) {
  const data: Record<string, unknown> = {};
  if (identity.em_google) data.sha256_email_address = identity.em_google;
  if (identity.ph_e164) data.sha256_phone_number = identity.ph_e164;
  if (identity.fn && identity.ln) data.address = { sha256_first_name: identity.fn, sha256_last_name: identity.ln };
  return data;
}

const snake = (name: string) => name.replace(/([a-z\d])([A-Z])/g, '$1_$2').replace(/\W+/g, '_').toLowerCase().slice(0, 40);

let loaded = false;

export const google: BrowserPlatform = {
  name: 'google',
  enabled: () => Boolean(tracking.ga4.measurementId || tracking.googleAds.id),
  load(identity) {
    if (loaded) return;
    loaded = true;
    ensureGtag();
    window.gtag('js', new Date());
    const { measurementId, linkerDomains } = tracking.ga4;
    if (measurementId) window.gtag('config', measurementId, linkerDomains.length ? { linker: { domains: linkerDomains } } : {});
    if (tracking.googleAds.id) window.gtag('config', tracking.googleAds.id, { allow_enhanced_conversions: true });
    google.identify?.(identity);
    loadScript(`https://www.googletagmanager.com/gtag/js?id=${measurementId || tracking.googleAds.id}`);
  },
  identify(identity) {
    const data = userData(identity);
    if (Object.keys(data).length) window.gtag?.('set', 'user_data', data);
  },
  track({ name, standard, data, eventId }) {
    const { measurementId } = tracking.ga4;
    if (measurementId) {
      const overrides = tracking.ga4.names as Record<string, string | false>;
      const eventName = standard || name in overrides ? platformName(name, 'ga4', overrides) : snake(name);
      // Without send_to, gtag sends the event to every configured target, including the Ads account.
      if (eventName) window.gtag('event', eventName, { ...toGa4(data, eventId), send_to: measurementId });
    }
    const conversion = (tracking.googleAds.conversions as Record<string, string | undefined>)[name];
    if (conversion) {
      window.gtag('event', 'conversion', {
        send_to: conversion,
        value: data.value,
        currency: data.currency,
        // transaction_id lets Google Ads drop duplicate conversions.
        transaction_id: data.order_id ?? eventId,
      });
    }
  },
};
