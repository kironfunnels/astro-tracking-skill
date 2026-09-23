# Catálogo de eventos e plano de medição

Os nomes canônicos são os eventos padrão da Meta. `src/tracking/events.ts` traduz cada um para as outras plataformas; `false` significa "a plataforma não tem equivalente, não envia".

| Canônico | GA4 | TikTok | Pinterest (tag / API) | Microsoft (ação) | Servidor |
| --- | --- | --- | --- | --- | --- |
| PageView | automático | `ttq.page()` | `page` | `pageLoad` automático | só Meta |
| ViewContent | `view_item` | ViewContent | pagevisit / page_visit | view_item | sim |
| Search | `search` | Search | search / search | search | sim |
| AddToCart | `add_to_cart` | AddToCart | addtocart / add_to_cart | add_to_cart | sim |
| AddToWishlist | `add_to_wishlist` | AddToWishlist | — | add_to_wishlist | sim |
| InitiateCheckout | `begin_checkout` | InitiateCheckout | — | begin_checkout | sim |
| AddPaymentInfo | `add_payment_info` | AddPaymentInfo | — | add_payment_info | sim |
| Purchase | `purchase` | Purchase | checkout / checkout | purchase | sim |
| Lead | `generate_lead` | SubmitForm | lead / lead | submit_lead_form | sim |
| CompleteRegistration | `sign_up` | CompleteRegistration | signup / signup | sign_up | sim |
| Contact | `contact` | Contact | — | contact | sim |
| Schedule | `schedule` | Schedule | — | book_appointment | sim |
| Subscribe | `subscribe` | Subscribe | — | subscribe | sim |
| StartTrial | `start_trial` | StartTrial | — | start_trial | sim |
| SubmitApplication | `submit_application` | SubmitApplication | — | submit_application | sim |

No GA4, `contact`, `schedule`, `subscribe`, `start_trial` e `submit_application` não são eventos recomendados oficiais: funcionam como eventos personalizados. Marque como **evento-chave** no GA4 o que for conversão.

Eventos personalizados (qualquer outro nome, ex.: `Scroll`, `VideoPlay50`) vão como `trackCustom` na Meta, em snake_case no GA4, com o nome original no TikTok e no UET, e não vão ao Pinterest. Só chegam ao servidor se listados em `tracking.serverCustomEvents`.

Renomear por plataforma: `tracking.<plataforma>.names = { Lead: 'NomeHistórico' }` ou `{ Contact: false }` para não enviar. No Google Ads e no LinkedIn, só eventos mapeados em `conversions` viram conversão.

## Parâmetros aceitos por `track()`

`value` (número), `currency` (ISO 4217, ex. `BRL`), `content_name`, `content_category`, `content_ids`, `content_type` (`product`/`product_group`), `contents` (`[{ id, quantity, item_price, name }]`), `num_items`, `search_string`, `order_id`, `predicted_ltv`, `status`. O runtime traduz para `items`/`transaction_id`/`search_term` (GA4), `contents`/`query`/`description` (TikTok), `line_items` (Pinterest), `revenue_value`/`event_label` (UET). O relay só repassa essas chaves (mais `percent_scrolled`).

Regras:

- `Purchase` exige `value` + `currency` na Meta. Use o valor real cobrado.
- `order_id` em compras: vira `transaction_id` no GA4/Ads e evita conversão duplicada no recarregamento.
- Não coloque dado pessoal em `content_name` ou em parâmetros livres.
- Use `value` em Lead só se o cliente tiver um valor por lead acordado; não invente.

## Dados de usuário (3º argumento)

`{ email, phone, countryCode, firstName, lastName, city, state, zip, country }`. Tudo é normalizado e transformado em SHA-256 no navegador, uma variante por plataforma, e guardado em `localStorage` **só em hash** para eventos seguintes da mesma pessoa.

## Sugestões por tipo de negócio

Proponha, explique o porquê e deixe o usuário escolher.

**Captação de leads (landing page, lançamento, evento gratuito)**
- `PageView` (todas), `ViewContent` na página da oferta com `content_name`.
- `Lead` na confirmação do formulário (resposta do provedor). É o evento de otimização.
- `Contact` em botões de WhatsApp/telefone (`data-track="Contact" data-track-content-name="WhatsApp"`).
- `CompleteRegistration` quando há segunda etapa (confirmação de e-mail, entrada no grupo).
- `Scroll` (25/50/75/90) só se o cliente usar para público ou diagnóstico de página.

**Infoproduto / venda com checkout externo**
- `ViewContent` na página de vendas, `InitiateCheckout` no clique para o checkout (com `value`/`currency` do plano), `Purchase` **pelo servidor** a partir do webhook/postback do checkout (com `order_id`), não na página de obrigado. Garanta que o link do checkout está em `decorateDomains` para carregar UTMs e click IDs.

**E-commerce**
- `ViewContent` (produto, `content_ids`, `value`), `AddToCart`, `InitiateCheckout`, `AddPaymentInfo`, `Purchase` com `contents` e `order_id`. `Search` com `search_string`.

**Serviços / negócio local**
- `Contact` (WhatsApp, telefone, e-mail), `Schedule` (agendamento concluído), `FindLocation` (mapa/rotas, personalizado se preferir), `Lead` (orçamento).

**SaaS**
- `CompleteRegistration` (conta criada), `StartTrial`, `Subscribe` (plano pago, `value`, `predicted_ltv`), `Lead` (demo).

## Perguntas para fechar o plano

1. Qual é **o** evento de otimização de cada plataforma (normalmente um só)?
2. Esse evento é confirmado pelo navegador ou só pelo servidor (pagamento aprovado, lead qualificado)?
3. Há valor monetário confiável? Qual moeda?
4. Quais dados de usuário existem no momento da conversão?
5. Existe algum nome histórico que relatórios e públicos já usam (manter via `names`)?
