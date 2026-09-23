# LinkedIn — Insight Tag (+ Conversions API opcional)

Conferido em 2026-09.

- Conversions API: https://learn.microsoft.com/en-us/linkedin/marketing/integrations/ads-reporting/conversions-api
- Versionamento (cabeçalho `Linkedin-Version: YYYYMM`): https://learn.microsoft.com/en-us/linkedin/marketing/versioning

## No template

`platforms/linkedin.ts` carrega a Insight Tag com o `partnerId` e, para cada evento mapeado em `tracking.linkedin.conversions` (`{ Lead: 1234567 }`), chama `lintrk('track', { conversion_id, event_id })`. Crie a conversão em Campaign Manager → **Análise (Measurement) → Rastreamento de conversões**, método "Insight Tag / evento", e copie o ID numérico.

## Por que a CAPI do LinkedIn não vem no relay

Ela exige **OAuth de 3 etapas** com os escopos `rw_conversions` e `r_ads`, token de membro que expira (é preciso renovar com refresh token), uma regra de conversão criada com `conversionMethod: "CONVERSIONS_API"` e campanhas associadas. Isso é integração de backend com armazenamento de refresh token, não um secret fixo. Quando o cliente precisar:

- Endpoint: `POST https://api.linkedin.com/rest/conversionEvents` com `Authorization: Bearer`, `Linkedin-Version: YYYYMM`, `X-Restli-Protocol-Version: 2.0.0`.
- Corpo: `conversion` (`urn:lla:llaPartnerConversion:<id>`), `conversionHappenedAt` (ms, até 90 dias), `conversionValue`, `eventId` (igual ao do `lintrk` para deduplicar), `user.userIds` com pelo menos um de `SHA256_EMAIL`, `LINKEDIN_FIRST_PARTY_ADS_TRACKING_UUID` (valor do `li_fat_id`, já persistido pelo runtime), `PLAINTEXT_IP_ADDRESS`, `ACXIOM_ID`, `GOOGLE_AID`, ou `userInfo` com nome e sobrenome.
- Limites: 600 requisições/min e 500 mil/dia por token; lotes de até 5.000 com `X-RestLi-Method: BATCH_CREATE`.
- As versões mensais são desativadas depois de cerca de um ano; confira o aviso de descontinuação na página antes de fixar a versão.
