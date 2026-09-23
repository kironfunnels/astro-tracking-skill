# Auditoria da skill `easy-pixel`

**Data:** 23/09/2026. **Escopo:** `SKILL.md`, todos os 15 arquivos em `references/`, `templates/**` e `scripts/**`. Revisão estática, confrontada com documentação oficial atual. Não houve instalação num site, tráfego real para APIs nem validação de build dos adaptadores. As páginas da Meta retornaram HTTP 429 e a referência técnica do TikTok renderizou sem conteúdo; os pontos dependentes dessas páginas ficam em “não consegui verificar”.

## Confirmado pela documentação oficial e pelo código

### 1. [Alto] `after()` no adaptador Next.js recebe uma Promise em vez de callback

- **Arquivo:linha:** `skills/easy-pixel/templates/adapters/next/app/api/events/route.ts:11`.
- **Faz:** `after(promise)` ao registrar a entrega de fundo. O contrato atual do Next.js diz “accepts a callback”, que será executado após a resposta ([documentação `after`](https://nextjs.org/docs/app/api-reference/functions/after)). Uma Promise já iniciada não satisfaz a assinatura e tende a falhar na tipagem ou em tempo de execução.
- **Correção:** usar `after(() => promise)`; verificar build e uma entrega real no host escolhido.

### 2. [Alto] Catálogo do Pinterest desatualizado descarta conversões válidas

- **Arquivo:linha:** `skills/easy-pixel/templates/core/tracking/events.ts:16-29`; `skills/easy-pixel/references/pinterest.md:21-30`.
- **Diz/faz:** `ViewContent` vira `page_visit`, enquanto `AddPaymentInfo`, `AddToWishlist`, `InitiateCheckout`, `Contact`, `Schedule`, `Subscribe`, `StartTrial` e `SubmitApplication` são `false` no Pinterest. A [lista oficial](https://developers.pinterest.com/docs/track-conversions/track-conversions-in-the-api/) inclui `view_content`, `add_payment_info`, `add_to_wishlist`, `initiate_checkout`, `contact`, `schedule`, `subscribe`, `start_trial` e `submit_application` como eventos padrão. Ela distingue `page_visit` de `view_content`.
- **Correção:** atualizar os pares Tag/API conforme o catálogo atual e permitir configuração explícita de `ViewContent` versus `PageVisit`; testar cada evento em Test Events. Evitar trocar nomes históricos sem avaliar impacto nos relatórios.

### 3. [Alto] Normalização Gmail para conversões otimizadas não remove `+alias`

- **Arquivo:linha:** `skills/easy-pixel/templates/core/tracking/identity.ts:58-62`; `skills/easy-pixel/references/google.md:17`.
- **Faz:** remove pontos de `gmail.com`/`googlemail.com`, mas mantém `+alias`. A [documentação oficial de enhanced conversions](https://developers.google.com/google-ads/api/docs/conversions/upload-online) exige, para esses dois domínios, remover pontos **e** o sufixo `+` antes do SHA-256 (“removing periods and plus suffixes”). `nome+promo@gmail.com` produz hash diferente do esperado.
- **Correção:** remover `+` e tudo após ele na parte local apenas desses domínios, antes do hash; adicionar vetores de teste para Gmail, Googlemail e domínio comum.

### 4. [Médio] Deduplicação do TikTok tem ressalva temporal ausente no guia

- **Arquivo:linha:** `skills/easy-pixel/references/tiktok.md:32`; `skills/easy-pixel/templates/core/tracking/server/tiktok.ts:2`.
- **Diz:** cópias com mesmo evento e `event_id` são descartadas em janela de 48 h. A [ajuda oficial de deduplicação](https://ads.tiktok.com/help/article/event-deduplication?lang=en) especifica que, no cruzamento **Pixel × Events API**, as cópias são mescladas “after 5 minutes and within a 48-hour window”. A afirmação sem essa condição pode induzir uma validação imediata incorreta.
- **Correção:** documentar a regra de 5 minutos a 48 horas e validar o resultado após o intervalo apropriado no Events Manager.

### 5. [Médio] Pinterest: substituição de nome por configuração não se propaga à API

- **Arquivo:linha:** `skills/easy-pixel/templates/core/tracking/platforms/pinterest.ts:38-42`; `skills/easy-pixel/templates/core/tracking/server/pinterest.ts:10-14`.
- **Faz:** a tag respeita `tracking.pinterest.names`, mas o relay só consulta essa configuração para `false`; um nome substituto continua sendo o nome do catálogo na CAPI. A [documentação do Pinterest](https://developers.pinterest.com/docs/track-conversions/track-conversions-in-the-api/) requer `event_id` para “deduplicating events” da API com a tag; nomes divergentes comprometem a correspondência do par. A exigência de igualdade de nomes é inferida da semântica do evento, não confirmada nessa página.
- **Correção:** representar explicitamente os nomes Tag/API no override e aplicar os dois lados juntos; teste de payload para override de `Lead`.

### 6. [Médio] Identificador próprio da Microsoft é enviado sem ID Sync

- **Arquivo:linha:** `skills/easy-pixel/templates/core/tracking/server/microsoft.ts:36`; `skills/easy-pixel/references/microsoft.md:23`.
- **Faz:** envia `trk_vid` como `anonymousId`, mas a skill não instala o pixel de ID Sync. A [Microsoft](https://learn.microsoft.com/en-us/advertising/guides/uet-conversion-api-integration) diz que o `anonymousId` “must match the vid” do pixel para vincular identidades; ID Sync é necessário para públicos e remarketing dinâmico.
- **Correção:** incluir a instalação e validação do ID Sync com o mesmo VID, ou descrever que essa capacidade não está implementada e suas limitações de atribuição.

### 7. [Médio] Limite de 16 KB é aplicado depois de ler o corpo inteiro

- **Arquivo:linha:** `skills/easy-pixel/templates/core/tracking/server/relay.ts:204-205`.
- **Faz:** `await request.text()` carrega tudo em memória antes de verificar `body.length`. A [Cloudflare](https://developers.cloudflare.com/workers/platform/limits/) informa “Memory | 128 MB” e corpos de requisição que podem chegar a 100 MB ou mais conforme o plano. A checagem não impede consumo desproporcional de memória.
- **Correção:** rejeitar `Content-Length` acima do teto quando presente e ler o stream com corte de bytes; usar um limite medido em bytes, incluindo UTF-8.

## Bugs confirmados por inspeção do código; a fonte oficial sustenta o impacto

### 8. [Crítico] Relay público aceita eventos forjados e consentimento/teste autodeclarados

- **Arquivo:linha:** `skills/easy-pixel/templates/core/tracking/server/relay.ts:115-147,184-213`; `skills/easy-pixel/templates/core/tracking/server/microsoft.ts:31-38`.
- **Faz:** basta incluir um `event_source_url` com hostname permitido; `Origin` é opcional e não autentica um cliente HTTP. `event_id`, hashes, click IDs e `test` vêm do corpo. O relay envia para as plataformas com tokens do proprietário. A [Microsoft](https://learn.microsoft.com/en-us/advertising/guides/uet-conversion-api-integration) trata `adStorageConsent` como sinal explícito “G – Granted” / “D – Denied”; o código fixa `G` com base apenas na decisão do JavaScript do visitante. Qualquer cliente pode inundar o dataset, gastar cota e declarar consentimento que o servidor não verificou. A documentação da API não define autenticação do relay próprio; esta conclusão é da inspeção de segurança.
- **Correção:** limitar taxa e volume no edge, validar `Origin` e `Sec-Fetch-Site` como barreiras complementares, vincular eventos a sessão/nonce de curta duração quando viável, e não tratar o corpo como prova de consentimento. Para conversões de alto valor, gerar o evento a partir do backend que confirma a transação.

### 9. [Alto] Auditoria “dry” deixa passar relay em subdomínio

- **Arquivo:linha:** `skills/easy-pixel/scripts/audit-site.mjs:8-11,48-49,184-189`; `skills/easy-pixel/references/audit.md:14`.
- **Diz/faz:** promete bloquear todos os disparos; a interceptação bloqueia endpoints de lista fixa e POSTs da **mesma origem**. Um relay recomendado em `track.example.com` é outra origem e não está na lista, então recebe `fbclid`/`gclid`/`ttclid` inventados durante a auditoria. A [orientação oficial do Pinterest](https://developers.pinterest.com/docs/track-conversions/track-conversions-in-the-api/) define `click_id` como “unique click identifier”; a [ajuda do TikTok](https://ads.tiktok.com/help/article/event-deduplication?lang=en) confirma que os eventos da API entram na medição.
- **Correção:** em modo dry, bloquear por padrão todo POST/beacon de rastreamento a destinos externos ao site, inclusive o endpoint configurado e subdomínios; preferir allowlist estrita de navegação/recursos necessários. Testar com relay em subdomínio.

### 10. [Alto] URLs e dados comerciais atravessam o relay sem sanitização suficiente

- **Arquivo:linha:** `skills/easy-pixel/templates/core/tracking/server/relay.ts:96-111,121-145`; `skills/easy-pixel/templates/core/tracking/client.ts:113-116`; `skills/easy-pixel/templates/core/tracking/params.ts:74-84`.
- **Faz:** o navegador remove apenas nomes de parâmetros suspeitos e valores com `@`; o relay aceita `event_source_url` com qualquer caminho/query no host aprovado, e `referrer_url` como texto livre de até 2.000 caracteres. `content_ids` e `contents[].id` não têm limite por item nem exame de dado pessoal. Por exemplo, `?id=5511999999999` ou `/usuario/joao@...` pode seguir para Meta/TikTok/Pinterest/Microsoft; `referrer_url` pode conter qualquer URL. O [guia do Pinterest](https://developers.pinterest.com/docs/track-conversions/track-conversions-in-the-api/) pede “full URL path” em `event_source_url` e descreve `custom_data.contents`. A constatação da lacuna é do código.
- **Correção:** política de URLs por rota e parâmetro permitido, remoção/mascaramento de identificadores no caminho, sanitizar `referrer_url` no servidor e impor limites/validação específicos por campo. Não presumir que SHA-256 de `user_data` cobre os demais campos.

### 11. [Alto] Revogar e aceitar novamente pode deixar Meta/TikTok em estado revogado

- **Arquivo:linha:** `skills/easy-pixel/templates/core/tracking/client.ts:148-175,194-204`; `skills/easy-pixel/references/consent.md:12`.
- **Faz:** `consent(false)` chama `fbq('consent','revoke')` e `ttq.revokeConsent()`. Em seguida `consent(true)` chama `loadPlatform()`, mas plataformas já em `installed` não executam `load()` e não há `fbq('consent','grant')` nem `ttq.grantConsent()`. O conjunto `active` volta a enviar eventos, porém as bibliotecas podem seguir em modo revogado. O [Google](https://developers.google.com/tag-platform/security/guides/consent) explicita que consentimento deve receber `update` quando a escolha muda; para Meta/TikTok, a falha é inferida diretamente das chamadas do código, pois as referências oficiais dessas APIs não ficaram acessíveis nesta auditoria.
- **Correção:** na transição de negado para concedido, emitir os comandos de concessão das tags já instaladas, com teste de sequência aceitar → revogar → aceitar e inspeção dos hits.

### 12. [Alto] Fila pré-consentimento não tem limite nem descarte na recusa

- **Arquivo:linha:** `skills/easy-pixel/templates/core/tracking/client.ts:137-145,170-174,194-204`; `skills/easy-pixel/references/consent.md:10-12`.
- **Faz:** todo evento anterior ao consentimento entra em `pending`; `consent(false)` não limpa a fila. Se o usuário recusar e depois aceitar na mesma página, eventos anteriores à recusa são entregues à Meta, TikTok, Pinterest, LinkedIn e relay, inclusive com dados da época anterior. Visitas longas podem acumular memória. A [orientação de consentimento do Google](https://developers.google.com/tag-platform/security/guides/consent) requer que o estado seja atualizado conforme a escolha; o tratamento da fila das outras plataformas é uma decisão do runtime.
- **Correção:** descartar a fila quando houver recusa explícita; estabelecer teto e TTL para eventos anteriores à decisão e documentar a regra de replay.

### 13. [Médio] Falhas parciais da CAPI são tratadas como sucesso

- **Arquivo:linha:** `skills/easy-pixel/templates/core/tracking/server/relay.ts:150-156,222-227`.
- **Faz:** `post()` só registra erro se `!response.ok`; responde sempre 204 ao navegador. A [documentação do Pinterest](https://developers.pinterest.com/docs/track-conversions/track-conversions-in-the-api/) mostra resposta com `num_events_received: 2`, `num_events_processed: 1` e erro por evento. A [Microsoft](https://learn.microsoft.com/en-us/advertising/guides/uet-conversion-api-integration) também documenta “Validation warning | 200”. Assim, conversões rejeitadas ou campos descartados podem ficar invisíveis.
- **Correção:** ler e classificar corpo de resposta por plataforma, emitir métricas de processados/rejeitados/avisos, alertar em falhas sustentadas e definir retentativa apenas para erros transitórios com `event_id` estável.

### 14. [Médio] Captura de formulários falha com `Request` e regex global

- **Arquivo:linha:** `skills/easy-pixel/templates/core/tracking/form-capture.ts:80-99`.
- **Faz:** quando a aplicação chama `fetch(new Request(url, {body: ...}))`, o método e URL são lidos do `Request`, mas o corpo só vem de `init?.body`; `map()` nunca recebe os campos. Se `options.match` usa flag `g`/`y`, chamadas sucessivas de `.test()` alternam resultado por `lastIndex`. Não há contrato de plataforma para esse helper; é defeito lógico por inspeção.
- **Correção:** usar `input.clone()` para ler o corpo quando `init.body` está ausente, com suporte a JSON/formulário e limites; remover flags com estado ou zerar `lastIndex` antes de testar.

### 15. [Médio] “Último toque” é substituído por qualquer query string não pessoal

- **Arquivo:linha:** `skills/easy-pixel/templates/core/tracking/params.ts:41-67,86-87`; `skills/easy-pixel/references/params.md:7-16`.
- **Faz:** uma visita orgânica a `?sort=price` ou `?page=2` cria novo `last` e apaga UTMs anteriores, embora o texto prometa persistência por 90 dias. Um click ID anterior ainda fica em `clicks`, gerando atribuição incoerente entre URL/formulário e CAPI. Não há regra oficial para o modelo de último toque; isto é um caso de borda da política da própria skill.
- **Correção:** atualizar `last` apenas diante de sinal de campanha novo (UTM/click ID/referrer qualificado), mantendo os demais parâmetros em armazenamento separado ou mesclando sem apagar a campanha.

### 16. [Médio] Formulário declarativo conta `submit`, não confirmação do servidor

- **Arquivo:linha:** `skills/easy-pixel/templates/core/tracking/client.ts:254-259`; `skills/easy-pixel/SKILL.md:74-77`.
- **Faz:** o listener de `submit` chama `track()` imediatamente. O guia restringe o uso a formulários onde `submit == success`, mas essa garantia não é verificável pelo template; uma validação assíncrona ou resposta 4xx ainda produz `Lead`. Não há API oficial que transforme `submit` em confirmação de negócio; é limitação lógica do gatilho.
- **Correção:** usar esse atributo só com integração que controla o sucesso; nos demais casos, chamar `track()` após resposta confirmada ou webhook, e ressaltar a restrição junto ao exemplo de instalação.

## Suspeitas e pontos não verificados

### 17. [Médio, suspeita] Reconstituição de `_fbc` no servidor fixa `fb.1`

- **Arquivo:linha:** `skills/easy-pixel/templates/core/tracking/server/meta.ts:12-16`; `skills/easy-pixel/references/meta.md:38`.
- **Faz:** `resolveFbc()` usa `fb.1` quando não recebe cookie, mesmo em domínio `.com.br`, enquanto o próprio `client.ts:94-102` calcula índice 2 nesse caso. Isso é incoerência interna e pode reduzir match. **Não consegui verificar a regra exata de `subdomainIndex` na [página oficial de `_fbc`/`_fbp`](https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/fbp-and-fbc): HTTP 429.**
- **Correção sugerida:** confirmar no guia oficial e calcular o índice com o domínio/cookie real, em vez de fixar 1.

### 18. [Médio, suspeita] Token Meta na query string

- **Arquivo:linha:** `skills/easy-pixel/templates/core/tracking/server/meta.ts:64`.
- **Faz:** `access_token` é colocado no URL, suscetível a aparecer em logs de saída, traces e mensagens de erro. O script de backfill usa token no corpo (`scripts/backfill-meta.mjs:166-173`). **Não consegui comparar os métodos aceitos na [referência oficial da Meta](https://developers.facebook.com/docs/marketing-api/conversions-api): HTTP 429.**
- **Correção sugerida:** se o endpoint aceitar, enviar token em cabeçalho ou corpo; de todo modo, redigir query string dos logs e traces.

### 19. [Médio, não verificado] Versões e payloads Meta/TikTok

- **Arquivo:linha:** `skills/easy-pixel/templates/core/tracking/server/meta.ts:9`; `skills/easy-pixel/templates/core/tracking/server/tiktok.ts:8-44`; `skills/easy-pixel/references/tiktok.md:5-32`.
- **Diz/faz:** fixa Graph `v26.0` e Events API `/open_api/v1.3/event/track/`, com nomes de campos e snippet próprios. A [página de changelog da Meta](https://developers.facebook.com/docs/graph-api/changelog) retornou HTTP 429; o [portal técnico do TikTok](https://business-api.tiktok.com/portal/docs/events-api-2.0/v1.3) retornou HTML sem conteúdo legível. Não é possível afirmar aqui que versão, janela de `event_time`, `ttq` base e corpo JSON estejam atuais.
- **Correção sugerida:** abrir essas referências em ambiente com acesso, confrontar payload com exemplos oficiais e validar com respostas de Test Events antes de publicar. Não há evidência para alterar constantes nesta auditoria.

### 20. [Baixo, não verificado] Snippets de LinkedIn e UET

- **Arquivo:linha:** `skills/easy-pixel/templates/core/tracking/platforms/linkedin.ts:19-34`; `skills/easy-pixel/templates/core/tracking/platforms/microsoft.ts:31-56`.
- **Faz:** gera `lintrk` e inicializa `new UET(...)`/`pageLoad` manualmente. Confirmei a forma de `uetq.push('event', ..., {event_id})` na [Microsoft](https://learn.microsoft.com/en-us/advertising/guides/uet-conversion-api-integration) e a [CAPI opcional do LinkedIn](https://learn.microsoft.com/en-us/linkedin/marketing/integrations/ads-reporting/conversions-api), mas não achei nessas páginas uma confirmação inequívoca do **snippet base completo**, do campo `event_id` aceito por `lintrk`, ou se o construtor UET já envia a primeira page load. Não classifico isso como bug confirmado.
- **Correção sugerida:** comparar o código base gerado pelos painéis das duas contas e capturar hits reais em ambiente de teste, sobretudo primeira page load e navegação SPA.

## Lacunas de produção

- **Transações e idempotência:** `track('Purchase')` gera UUID novo em cada chamada (`client.ts:187-191`), inclusive recarga/retry. Só Ads usa `order_id` diretamente como `transaction_id`; para Meta/TikTok/Pinterest/Microsoft, `event_id` muda. Derivar ID estável de pedido confirmado e manter registro de envio no backend para compras/assinaturas.
- **Observabilidade:** sem fila durável, retentativas, métricas e alertas; `sendBeacon` confirma enfileiramento local, não processamento remoto (`client.ts:124-127`, `relay.ts:150-156`). Uma resposta 204 esconde falha posterior. Adicionar logs sem PII, contadores por destino e rotina de reconciliação.
- **Privacidade operacional:** `trk_identity` e `trk_params` ficam em `localStorage` e `trk_vid` em cookie por até 400 dias (`client.ts:17,342`, `params.ts:10-11`); a referência reconhece que hash é dado pseudonimizado (`references/consent.md:35`). Definir retenção, apagamento ao revogar, tratamento de visitantes em dispositivos compartilhados e revisão de CMP por jurisdição.
- **Ambiente e host:** `nuxt/server/api/events.ts:8` usa `process.env` embora o comentário reconheça `event.context.cloudflare.env`; no preset Cloudflare, o segredo pode não chegar ao relay. Testar build e evento por preset, inclusive versões mínimas de Nuxt/h3. `after()` no Next exige suporte do host; a [documentação Next](https://nextjs.org/docs/app/api-reference/functions/after) especifica integração `waitUntil` em hosts serverless.
- **Testes de regressão:** incluir consentimento aceitar/revogar/aceitar, relay em subdomínio no modo dry, falha parcial HTTP 200, formulário `Request`, paginação por query sem UTM, `Purchase` repetido e PII em URL/campos de produto. Os testes existentes não exercitam esses cenários.

## Verificações corretas

- `google.ts:33-42` coloca os quatro sinais do Consent Mode v2 em `default` antes de `config` e usa `update` na mudança; corresponde ao [guia do Google](https://developers.google.com/tag-platform/security/guides/consent).
- `identity.ts:65-69` remove pontos e `+alias` do e-mail para Microsoft; `microsoft.ts:42-53` usa `POST /v1/{tagId}/events`, Bearer, `eventTime` em segundos e IDs de deduplicação compatíveis com a [especificação Microsoft](https://learn.microsoft.com/en-us/advertising/guides/uet-conversion-api-integration).
- `server/pinterest.ts:12-49` usa endpoint `/v5/ad_accounts/{id}/events`, Bearer, `?test=true`, `event_id` e `user_data.em` em array, como no [guia oficial](https://developers.pinterest.com/docs/track-conversions/track-conversions-in-the-api/). O fluxo de token em `references/pinterest.md:34-35` está essencialmente alinhado, embora o painel atual inclua “Set up API” e “Conversion access token”.
- O [TikTok](https://ads.tiktok.com/help/article/event-deduplication?lang=en) confirma o uso conjunto de `event` e `event_id` e a janela máxima de 48 h; `tiktok.ts:57-58` e `server/tiktok.ts:29-33` compartilham o ID.
- As APIs dos adaptadores Cloudflare Pages (`onRequest`/`waitUntil`), Astro Cloudflare (`cloudflare:workers`/`cfContext`), Vercel (`@vercel/functions` `waitUntil`), Nuxt (`event.waitUntil`) e Netlify (`Context.waitUntil`/`ip`/`geo`) constam das respectivas [Cloudflare Pages](https://developers.cloudflare.com/pages/functions/api-reference/), [Astro](https://docs.astro.build/en/guides/integrations-guide/cloudflare/), [Vercel](https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package), [Nuxt](https://nuxt.com/docs/3.x/directory-structure/server) e [Netlify](https://docs.netlify.com/build/functions/api/). A configuração de secrets em Cloudflare e Netlify também está coerente com esses guias.
- `references/linkedin.md:16-18` descreve a CAPI separada com `POST /rest/conversionEvents`, `Linkedin-Version`, URN de conversão e tempo em milissegundos; esses campos aparecem na [documentação do LinkedIn](https://learn.microsoft.com/en-us/linkedin/marketing/integrations/ads-reporting/conversions-api).

**Método:** inspeção linha a linha dos arquivos do escopo e consulta às URLs oficiais citadas em 23/09/2026. Não tratei ausência de confirmação como erro comprovado. A auditoria não editou arquivos da skill e não fez commit/push.
