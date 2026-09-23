# Pinterest — tag + Conversions API

Conferido em 2026-09.

- Conversions API: https://developers.pinterest.com/docs/track-conversions/track-conversions-in-the-api/
- Endpoint (referência): https://developers.pinterest.com/docs/api/v5/events-create/
- Boas práticas: https://developers.pinterest.com/docs/conversions/best/

## Como o template implementa

- Navegador (`platforms/pinterest.ts`): `pintrk('load', <TAG_ID>, { em: <sha256> })`, `pintrk('page')`, `pintrk('track', <evento>, { ...dados, event_id })`.
- Servidor (`server/pinterest.ts`): `POST https://api.pinterest.com/v5/ad_accounts/<AD_ACCOUNT_ID>/events` com `Authorization: Bearer <token>`; `?test=true` quando a aba tem `?trk_test_pinterest=1`.
- `user_data`: `em`, `ph`, `fn`, `ln`, `ct`, `st`, `zp`, `country`, `external_id` em arrays de SHA-256 (mesma normalização da Meta), `client_ip_address`, `client_user_agent`, `click_id` (cookie `_epik` ou parâmetro `epik`).
- `custom_data`: `currency`, `value` (**string**), `content_ids`, `contents` (`id`, `item_price` string, `quantity`), `num_items`, `order_id`, `search_string`.
- Deduplicação: mesmo `event_name` + `event_id` nos dois canais, janela de 48 h.

## Nomes de eventos

A tag e a API usam grafias diferentes (tabela "Name in Tag" / "Name in API" do guia oficial, conferida em 2026-09). O catálogo guarda os dois:

| Canônico | Tag (`pintrk`) | API (`event_name`) |
| --- | --- | --- |
| ViewContent | `ViewContent` | `view_content` |
| Search | `Search` | `search` |
| AddToCart | `AddToCart` | `add_to_cart` |
| AddToWishlist | `AddToWishList` | `add_to_wishlist` |
| InitiateCheckout | `InitiateCheckout` | `initiate_checkout` |
| AddPaymentInfo | `AddPaymentInfo` | `add_payment_info` |
| Purchase | `Checkout` | `checkout` |
| Lead | `Lead` | `lead` |
| CompleteRegistration | `SignUp` | `signup` |
| Contact, Schedule, Subscribe, StartTrial, SubmitApplication | `Contact`, `Schedule`, `Subscribe`, `StartTrial`, `SubmitApplication` | `contact`, `schedule`, `subscribe`, `start_trial`, `submit_application` |

Também existem `PageVisit`/`page_visit`, `ViewCategory`/`view_category`, `WatchVideo`/`watch_video`, `CustomizeProduct` e `FindLocation`: use via `tracking.pinterest.names` (ex.: `{ ViewContent: ['PageVisit', 'page_visit'] }` para manter um nome histórico). O override vale para tag **e** API juntos, para não quebrar a deduplicação. `PageView` usa `pintrk('page')` e não vai ao servidor.

## Token

1. Pinterest Ads Manager → **Conversões** (Conversions) → **Conversions API** → **Gerar novo token** (exige acesso de administrador à conta de anúncios).
2. Cadastre como secret `PINTEREST_CONVERSIONS_TOKEN`. O ID da tag e o ID da conta de anúncios vão em `config.ts`.

## Testar

Abra o site com `?trk_test_pinterest=1` e confira em Ads Manager → Conversões → **Eventos de teste**. Em modo de teste o lote aceita no máximo 20 eventos.
