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

A tag e a API usam grafias diferentes; o catálogo guarda os dois:

| Canônico | Tag (`pintrk`) | API (`event_name`) |
| --- | --- | --- |
| ViewContent | `pagevisit` | `page_visit` |
| Search | `search` | `search` |
| AddToCart | `addtocart` | `add_to_cart` |
| Purchase | `checkout` | `checkout` |
| Lead | `lead` | `lead` |
| CompleteRegistration | `signup` | `signup` |

Eventos sem equivalente não vão ao Pinterest. `PageView` usa `pintrk('page')` e não vai ao servidor.

## Token

1. Pinterest Ads Manager → **Conversões** (Conversions) → **Conversions API** → **Gerar novo token** (exige acesso de administrador à conta de anúncios).
2. Cadastre como secret `PINTEREST_CONVERSIONS_TOKEN`. O ID da tag e o ID da conta de anúncios vão em `config.ts`.

## Testar

Abra o site com `?trk_test_pinterest=1` e confira em Ads Manager → Conversões → **Eventos de teste**. Em modo de teste o lote aceita no máximo 20 eventos.
