# TikTok — Pixel + Events API 2.0

Conferido em 2026-09. O portal de docs do TikTok carrega por JavaScript; se uma página não abrir, use o Gerenciador de Eventos (Events Manager), que mostra o snippet e o payload atuais.

- Events API 2.0 (v1.3): https://business-api.tiktok.com/portal/docs/events-api-2.0/v1.3
- Guia de configuração web: https://business-api.tiktok.com/portal/docs/setup-guide-for-web/v1.3
- Eventos padrão e parâmetros: https://ads.tiktok.com/help/article/standard-events-parameters
- Sobre a Events API: https://ads.tiktok.com/help/article/events-api

## Como o template implementa

- Navegador (`platforms/tiktok.ts`): stub do `ttq` equivalente ao código base oficial, `ttq.load(<PIXEL>)`, `ttq.identify({ email, phone_number, external_id })` com hashes, `ttq.page()` e `ttq.track(<evento>, <props>, { event_id })`.
- Servidor (`server/tiktok.ts`): `POST https://business-api.tiktok.com/open_api/v1.3/event/track/`, cabeçalho `Access-Token`, corpo:

```json
{
  "event_source": "web",
  "event_source_id": "<PIXEL_CODE>",
  "test_event_code": "TEST…",
  "data": [{
    "event": "SubmitForm",
    "event_time": 1760000000,
    "event_id": "<mesmo id do navegador>",
    "user": { "email": "<sha256>", "phone": "<sha256 E.164>", "external_id": "<sha256>", "ttp": "<cookie _ttp>", "ttclid": "<ttclid>", "ip": "…", "user_agent": "…" },
    "page": { "url": "…", "referrer": "…" },
    "properties": { "value": 10, "currency": "BRL", "contents": [{ "content_id": "…", "quantity": 1, "price": 10 }], "content_type": "product" }
  }]
}
```

- `PageView` **não** vai ao servidor: `ttq.page()` não aceita `event_id`, então não haveria deduplicação.
- Deduplicação ([ajuda oficial](https://ads.tiktok.com/help/article/event-deduplication?lang=en)): Pixel e Events API com o mesmo `event` e `event_id` são mesclados quando o segundo chega **depois de 5 minutos e dentro de 48 horas** do primeiro; o primeiro recebido é o que conta. Na validação, espere alguns minutos antes de concluir que a deduplicação falhou.

## Eventos padrão

`AddPaymentInfo`, `AddToCart`, `AddToWishlist`, `ApplicationApproval`, `CompleteRegistration`, `Contact`, `CustomizeProduct`, `Download`, `FindLocation`, `InitiateCheckout`, `Purchase`, `Schedule`, `Search`, `StartTrial`, `SubmitApplication`, `SubmitForm`, `Subscribe`, `ViewContent`. O catálogo mapeia `Lead` → `SubmitForm`; mude em `tracking.tiktok.names` se a conta usar outro nome de otimização.

Parâmetros: `contents` (`content_id`, `content_type`, `content_name`, `price`, `quantity`), `content_type`, `currency`, `value`, `query` (busca), `description`, `order_id`.

## Normalização

- E-mail: trim + minúsculas → SHA-256.
- Telefone: **E.164 com `+`** → SHA-256 (o runtime usa `ph_e164`).
- `external_id`: SHA-256.
- `ttclid` vem da URL (guardado pela persistência de parâmetros) e `ttp` do cookie `_ttp` criado pelo Pixel.

## Gerar o token

1. TikTok Ads Manager → **Ferramentas → Eventos (Events Manager)** → selecione o Pixel.
2. **Configurações** → seção **Events API** → **Gerar token de acesso**.
3. Cadastre como secret `TIKTOK_EVENTS_TOKEN` na Cloudflare. O código do Pixel (ex.: `C…`) vai em `config.ts`.

## Testar

Events Manager → Pixel → **Test Events** → copie o código `TEST…` → abra o site com `?trk_test_tiktok=TEST…`. Eventos de navegador e servidor aparecem na mesma tela. `TIKTOK_TEST_EVENT_CODE` como secret desvia todos os eventos; use só temporariamente.
