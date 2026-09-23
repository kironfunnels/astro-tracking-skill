# Meta — Pixel + API de Conversões

Conferido em 2026-09. Antes de implementar, abra as páginas oficiais abaixo e confirme versão e campos.

- Pixel (referência de eventos e parâmetros): https://developers.facebook.com/docs/meta-pixel/reference
- API de Conversões (uso e endpoint): https://developers.facebook.com/docs/marketing-api/conversions-api/using-the-api
- Parâmetros do evento de servidor: https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/server-event
- Dados do cliente (normalização/hash): https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/customer-information-parameters
- fbp e fbc: https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/fbp-and-fbc
- Deduplicação: https://developers.facebook.com/docs/marketing-api/conversions-api/deduplicate-pixel-and-server-events
- Changelog da Graph API (versão atual): https://developers.facebook.com/docs/graph-api/changelog
- Parameter Builder (biblioteca oficial, opcional): https://github.com/facebook/capi-param-builder

## Como o template implementa

| Peça | Arquivo | O que faz |
| --- | --- | --- |
| Pixel | `src/tracking/platforms/meta.ts` | Carrega `fbevents.js`, `init` com correspondência avançada em hash, `track`/`trackCustom` com `{ eventID }` |
| Cookies | `src/tracking/client.ts` (`ensureMetaCookies`) | Cria `_fbp` e `_fbc` antes do primeiro evento, no formato `fb.<índice>.<ms>.<valor>` |
| Servidor | `src/tracking/server/meta.ts` | `POST https://graph.facebook.com/v26.0/<PIXEL_ID>/events` com o mesmo `event_id` |

## Regras oficiais que o código segue

- **Deduplicação:** `eventID` do Pixel = `event_id` da API **e** `event` = `event_name`. Janela de 48 h a partir do primeiro recebimento. Só deduplica quando há os dois canais.
- **Evento de servidor obrigatório:** `event_name`, `event_time` (segundos, até 7 dias no passado; um único evento velho derruba o lote inteiro), `action_source: "website"`, `user_data`, e `event_source_url` para web (URL do domínio verificado).
- **Lote:** até 1.000 eventos por requisição. O relay manda um por requisição, em tempo real.
- **Hash (SHA-256 hex) obrigatório:** `em` (trim + minúsculas), `ph` (só dígitos com DDI, sem `+`), `fn`, `ln`, `ct`, `st`, `zp`, `country`, `ge`, `db`. `external_id` é recomendado com hash.
- **Nunca hashear:** `client_ip_address` (IPv6 preferido quando houver), `client_user_agent`, `fbc`, `fbp`.
- **fbc/fbp:** `fb.<subdomainIndex>.<creationTime em ms>.<valor>`. `subdomainIndex`: `com`=0, `example.com`=1, `www.example.com`=2; quando o servidor gera sem cookie, use 1. O `fbclid` é sensível a maiúsculas: **não altere**. `_fbc` com validade de 90 dias.
- **`test_event_code`** só para teste; remova em produção.
- **LDU (EUA):** `data_processing_options: ["LDU"]` + país/estado quando exigido. Não vem ligado no template.

## Eventos padrão e parâmetros

Obrigatórios: `Purchase` exige `value` e `currency`. Recomendados: `content_ids`, `contents` (`id`, `quantity`), `content_type` (`product`/`product_group`), `num_items`, `search_string`, `predicted_ltv`, `content_name`, `content_category`, `status`.

Padrão: `AddPaymentInfo`, `AddToCart`, `AddToWishlist`, `CompleteRegistration`, `Contact`, `CustomizeProduct`, `Donate`, `FindLocation`, `InitiateCheckout`, `Lead`, `Purchase`, `Schedule`, `Search`, `StartTrial`, `SubmitApplication`, `Subscribe`, `ViewContent`, além de `PageView`. Outros nomes vão como `trackCustom`.

## Gerar o token da API de Conversões

1. Gerenciador de Eventos → selecione o **conjunto de dados (Pixel)** correto.
2. Aba **Configurações**.
3. Seção **API de Conversões** → **Gerar token de acesso** (em "Configurar manualmente"). O link só aparece para quem tem permissão de desenvolvedor no ativo.
4. Copie o token **direto para o secret `META_CAPI_TOKEN` da Cloudflare** (ver `cloudflare.md`). Não salve em arquivo, e-mail ou chat.
5. Em **Visão geral → Gerenciar integrações**, a Meta cria o app e o usuário do sistema; não há App Review.

Se o token vazar: gere outro no mesmo lugar, atualize o secret, faça novo deploy. O token antigo deixa de ser necessário (revogue o usuário do sistema se for o caso).

## Testar

1. Gerenciador de Eventos → **Eventos de teste** → copie o código `TEST…`.
2. Abra o site com `?trk_test_meta=TEST12345` (a aba guarda o código na sessão; só ela manda eventos de servidor como teste).
3. Deve aparecer, para cada evento, uma linha **Navegador** e outra **Servidor – Desduplicado** com o mesmo ID. Abra o evento de servidor para ver as "chaves de dados do usuário" recebidas.
4. Só use o secret `META_TEST_EVENT_CODE` se não houver alternativa, e remova-o logo depois: ele desvia **todos** os eventos reais.

## Qualidade da correspondência (EMQ)

Mais chaves = melhor correspondência. O relay já envia IP, user agent, `fbp`, `fbc`, `external_id` e cidade/estado/CEP/país derivados do IP pela Cloudflare. Para subir o EMQ: capture e-mail e telefone no momento da conversão (`track(..., { email, phone })`), e nome quando o formulário tiver.

## Armadilhas

- Pixel também instalado no GTM, em plugin ou pelo provedor do formulário → eventos em dobro sem ID comum.
- `PageView` duplicado quando o snippet oficial fica no HTML além do runtime.
- Dado pessoal na URL (`?email=`) é sinalizado pela Meta; o runtime tira esses parâmetros de links e do `event_source_url`, mas corrija a origem (formulários GET com e-mail).
- Headless Chrome é ignorado pelo Pixel (user agent `HeadlessChrome`).
- Ao atualizar a Graph API, mude `META_GRAPH_VERSION` em `server/meta.ts`; versões antigas continuam funcionando por cerca de 2 anos, mas não deixe envelhecer.
