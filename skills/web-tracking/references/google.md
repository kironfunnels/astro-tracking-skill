# Google — gtag.js sem GTM: GA4, Google Ads, conversões otimizadas e Consent Mode

Conferido em 2026-09.

- Eventos recomendados do GA4: https://developers.google.com/analytics/devguides/collection/ga4/reference/events
- Conversões otimizadas para web (Google tag): https://support.google.com/google-ads/answer/13258081
- Consent Mode v2 (gtag): https://developers.google.com/tag-platform/security/guides/consent
- Measurement Protocol do GA4: https://developers.google.com/analytics/devguides/collection/protocol/ga4/sending-events
- Conversões otimizadas via API (servidor): https://developers.google.com/google-ads/api/docs/conversions/enhanced-conversions/web

## Como o template implementa (`src/tracking/platforms/google.ts`)

- Um único `gtag.js`, com `config` para o GA4 (`G-…`) e para o Google Ads (`AW-…`, `allow_enhanced_conversions: true`).
- Eventos do GA4 sempre com `send_to: <G-…>`. **Sem isso, o gtag envia o evento a todos os destinos configurados, inclusive ao Google Ads.**
- Nomes do GA4 vêm do catálogo (`generate_lead`, `purchase`, `sign_up`…). Para manter nomes históricos de relatórios, use `tracking.ga4.names` (ex.: `{ Lead: 'Lead' }`).
- Conversão do Ads só para eventos mapeados em `tracking.googleAds.conversions` (`{ Lead: 'AW-123456789/AbCdEf' }`), com `value`, `currency` e `transaction_id` (= `order_id` ou o `event_id`), que evita conversão duplicada.
- Conversões otimizadas: `gtag('set', 'user_data', { sha256_email_address, sha256_phone_number, address: { sha256_first_name, sha256_last_name } })` antes da conversão.

## Normalização do Google (diferente da Meta)

- E-mail: trim, minúsculas e **remoção dos pontos antes de `@gmail.com`/`@googlemail.com`**.
- Telefone: **E.164 com `+`** (ex.: `+5511999998888`) antes do hash.
- Hash SHA-256 em hexadecimal. O runtime calcula `em_google` e `ph_e164` separadamente.

## Configurar no Google Ads

1. Metas → Conversões → crie a ação de conversão do tipo **Site**, configurada **manualmente com código**; copie o `send_to` (`AW-…/rótulo`).
2. Metas → Configurações → **Conversões otimizadas** → ative e aceite os termos de dados do cliente. Escolha o método **Google tag / código**.
3. Informe ao usuário que o rótulo entra em `config.ts` (não é segredo).

## Click IDs do Google

`gclid` (clique padrão), `gbraid` e `wbraid` (iOS/app para web), `dclid` (Display & Video 360). O gtag grava `_gcl_aw`/`_gcl_gb` e `_gcl_au`. O runtime também guarda todos na persistência de parâmetros; se o site tiver várias páginas, eles seguem nos links.

## Consent Mode v2

Quatro sinais obrigatórios para EEE/Reino Unido: `ad_storage`, `ad_user_data`, `ad_personalization`, `analytics_storage`.

- `default` precisa vir **antes** de qualquer `config`. O template faz isso quando `consent: 'opt-in'` (modo avançado: o gtag carrega com tudo negado e manda pings sem cookie até a atualização).
- `update` quando o visitante aceita: `window.tracking.consent(true)`.
- Opcionais: `gtag('set', 'ads_data_redaction', true)` (oculta click IDs com `ad_storage` negado) e `gtag('set', 'url_passthrough', true)` (passa click IDs pela URL sem cookie).
- `wait_for_update` (ms) quando o CMP carrega de forma assíncrona. O template usa 500.

## Domínios cruzados (GA4)

Se a jornada passa por outro domínio próprio (ex.: site → checkout), liste ambos em `tracking.ga4.linkerDomains`. O gtag adiciona `_gl` aos links; a persistência de parâmetros não mexe em `_gl`.

## Quando manter o GTM

Só quando o cliente exigir (outras ferramentas dependem dele). Nesse caso:

- configure `tracking.gtm.containerId`; o runtime carrega o contêiner e faz `dataLayer.push({ event: '<Nome>', event_id, ...dados })`;
- **retire do contêiner** todo pixel que o código passou a carregar (Meta, GA4, Ads, TikTok…), ou o evento conta em dobro;
- dentro do GTM, tags que precisarem de deduplicação devem usar a variável `event_id` do dataLayer.

## Envio pelo servidor (opcional)

O gtag cobre GA4 e Ads no navegador. Envio pelo servidor só vale a pena para conversões que acontecem fora do navegador (CRM, pagamento aprovado depois):

- GA4 Measurement Protocol: `POST https://www.google-analytics.com/mp/collect?measurement_id=G-…&api_secret=…`, com `client_id` (valor do cookie `_ga`), até 25 eventos por requisição, até 72 h no passado. O `api_secret` é criado em Admin → Fluxos de dados → fluxo → **Chaves secretas da API do Measurement Protocol** e é **segredo** (Cloudflare secret). O próprio Google recomenda a **Data Manager API** para integrações novas de servidor.
- Google Ads: conversões offline/otimizadas pela Google Ads API (`ConversionAdjustmentUploadService` com `order_id` igual ao `transaction_id` da tag) ou pela Data Manager API. Exige developer token e OAuth; fica fora do template.

## Validar

- GA4: Admin → **DebugView** (abra o site com a extensão Tag Assistant ou `debug_mode`), e Tempo real.
- Google Ads: Metas → Conversões → status da ação; **Diagnóstico** das conversões otimizadas (leva até 72 h).
- Tag Assistant (tagassistant.google.com) para ver os comandos do gtag.
