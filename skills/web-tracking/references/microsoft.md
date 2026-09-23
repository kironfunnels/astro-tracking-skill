# Microsoft Advertising — UET + Conversions API

Conferido em 2026-09.

- Conversions API (CAPI) do UET: https://learn.microsoft.com/en-us/advertising/guides/uet-conversion-api-integration
- Conversões otimizadas: https://help.ads.microsoft.com/apex/index/3/en/60178
- Consentimento: https://help.ads.microsoft.com/apex/index/3/en/60119

## Como o template implementa

- Navegador (`platforms/microsoft.ts`): carrega `bat.js`, cria `new UET({ ti, enableAutoSpaTracking: true })`, envia `pageLoad`; eventos com `uetq.push('event', <ação>, { event_category, event_label, revenue_value, currency, event_id })`; conversões otimizadas com `uetq.push('set', { pid: { em, ph } })`.
- Consentimento: `uetq.push('consent', 'default' | 'update', { ad_storage })` quando `consent: 'opt-in'`.
- Servidor (`server/microsoft.ts`): `POST https://capi.uet.microsoft.com/v1/<TAG_ID>/events`, `Authorization: Bearer <token>`, `eventType: "custom"`, `eventId`/`eventName` iguais aos do navegador, `userData` com `msclkid`, `anonymousId`, `em`, `ph`, `clientIpAddress`, `clientUserAgent`, `adStorageConsent: "G"` (o navegador só chama o relay após consentimento).
- `PageView` não vai ao servidor: o `pageLoad` do UET não tem ID comum e contaria duas vezes.

## Regras oficiais relevantes

- `eventTime` em segundos, até 7 dias no passado. Até 1.000 eventos por lote.
- Deduplicação: mesmo tag ID + `eventName` + `eventId` no UET e na CAPI.
- `msclkid`: UUID; guarde o mais recente por 90 dias e sobrescreva quando chegar um novo (a persistência de parâmetros faz isso).
- E-mail: trim, **remover todos os pontos da parte local e o `+alias`**, minúsculas, SHA-256 (o runtime calcula `em_microsoft`). Telefone: E.164 com `+`, SHA-256.
- `anonymousId` deve casar com o `vid` do pixel de ID Sync se ele for usado (remarketing dinâmico); o template envia o ID de visitante próprio (`trk_vid`).

## Token

Pelo painel:

1. Microsoft Advertising → **Ferramentas → UET** → edite a tag (ícone de lápis).
2. **Salvar e avançar** → em "Set up tagging" escolha **Use Conversions API**.
3. Na seção Conversions API → **Copy Token** → Avançar → Concluir.

Cadastre como secret `MICROSOFT_CAPI_TOKEN`. O ID da tag UET vai em `config.ts`.

Metas de conversão: crie em **Conversões → Metas** do tipo *Evento personalizado* com **Ação** igual ao nome enviado (ex.: `submit_lead_form`). Os nomes vêm do catálogo e podem ser trocados em `tracking.microsoft.names`.

## Testar

Extensão **UET Tag Helper** no navegador para os eventos da tag; respostas da CAPI aparecem nos logs do relay (HTTP 200 com avisos de validação quando um campo opcional é descartado).
