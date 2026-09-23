---
name: astro-tracking
description: Audita, instala e mantém rastreamento de conversões direto no código de sites Astro, sem depender do Google Tag Manager — Meta Pixel + API de Conversões, GA4, Google Ads (conversões otimizadas), TikTok Pixel + Events API, Pinterest, Microsoft UET e LinkedIn — com event_id compartilhado para deduplicação, relay em Cloudflare (Pages Functions ou Workers) com tokens guardados como secrets, persistência de UTMs e click IDs entre páginas, captura confiável de formulários e testes Playwright. Use quando pedirem para instalar ou revisar pixel, CAPI, GA4, gtag, Google Ads, TikTok, conversões ou eventos, tirar o GTM, conferir se UTMs/fbclid/gclid chegam às próximas páginas ou auditar o rastreamento de um site Astro.
---

# Rastreamento direto em Astro

Esta skill conduz o trabalho completo: diagnóstico do que o site tem hoje, plano de eventos, implementação a partir dos templates, tokens na Cloudflare, persistência de parâmetros e validação em cada plataforma. Os templates foram extraídos de uma implementação em produção e testados com Astro 7 e Playwright.

## Princípios que não se negociam

1. **Uma fonte de disparo por evento.** Cada evento sai uma vez do navegador (pixel) e uma vez do servidor (API), com o **mesmo `event_id`**. Nunca deixe o mesmo pixel no GTM *e* no código.
2. **Tokens só como secret criptografado na Cloudflare.** Nunca no repositório, no `config.ts`, em variável `PUBLIC_*`, em `.env` versionado ou no chat. IDs de pixel/tag são públicos e podem ficar em `config.ts`.
3. **Dado pessoal sai do navegador só em SHA-256**, normalizado do jeito que cada plataforma documenta (ver `templates/src/tracking/identity.ts`). E-mail e telefone nunca vão em URL.
4. **Nada é enviado de `localhost`/`127.0.0.1`** a menos que a aba tenha `?trk_enable=1`; testes usam stubs.
5. **Documentação oficial vence memória.** Versões de API mudam (ex.: Graph API v26.0 em 2026-07). Antes de implementar, confira as páginas listadas em cada `references/<plataforma>.md` e atualize constantes se preciso.
6. **Não invente dados comerciais.** Valor, moeda, nome de produto e quais conversões otimizar vêm do usuário.

## Fluxo

Siga as fases em ordem. Ao final de cada fase, mostre ao usuário o resultado resumido antes de avançar quando houver decisão dele.

### Fase 0 — Contexto (perguntas curtas, só o que faltar)

- URL publicada (e de preview/staging) e rota(s) em escopo.
- Como o Astro é publicado: **estático no Cloudflare Pages** (usa `functions/`) ou **Workers com `@astrojs/cloudflare`** (usa endpoint Astro). Confira `astro.config.*`, `wrangler.*` e `package.json`.
- Plataformas desejadas e IDs públicos: Pixel da Meta, GA4 `G-…`, Google Ads `AW-…` + rótulos de conversão, TikTok, Pinterest (tag + ad account), UET, LinkedIn (partner + conversion IDs).
- Consentimento: público só no Brasil sem banner (`consent: 'none'`) ou banner/CMP (`'opt-in'`). Ver `references/consent.md`.
- Formulários e checkouts: provedor, se redireciona após o envio, se roda em iframe. Ver `references/forms.md`.

### Fase 1 — Diagnóstico do estado atual

1. Rode a auditoria no site publicado (da raiz do projeto, para o Playwright ser encontrado):
   ```bash
   node <skill>/scripts/audit-site.mjs https://site.com/pagina/ --pages 3 --json reports/tracking-audit.json
   ```
   Ela abre a página com UTMs e click IDs de teste, rola até o fim, segue links internos e relata: tags no HTML, disparos reais na rede (Pixel, GA4, Ads, TikTok, Pinterest, UET, LinkedIn, Clarity, Hotjar), POSTs para o próprio domínio (relay), cookies (`_fbp`, `_fbc`, `_gcl_aw`, `_ttp`, `_epik`, `_uetmsclkid`…), persistência de parâmetros, formulários, iframes, erros de console e **segredos expostos**. Detalhes e leitura do relatório: `references/audit.md`.
2. Leia o código: `grep -rE "fbq|gtag|GTM-|ttq|pintrk|uetq|lintrk|dataLayer|graph.facebook"` fora de `node_modules`/`dist`.
3. Se houver MCP da Meta ou do Google disponível, consulte a qualidade do dataset/eventos recebidos (EMQ, deduplicação). Caso contrário, peça um print do Gerenciador de Eventos.
4. Entregue uma tabela: **plataforma | instalada? | como (GTM, inline, plugin) | eventos vistos | dedup | problemas**, seguida dos achados críticos (token exposto, evento em dobro, Lead que nunca dispara, parâmetros perdidos).

### Fase 2 — Plano de eventos

1. Mapeie a jornada (entrada → interação → conversão → pós-conversão) e proponha eventos com base em `references/events.md`, que traz o catálogo canônico, o nome em cada plataforma e sugestões por tipo de negócio.
2. Para cada evento defina: gatilho exato, parâmetros (`value`, `currency`, `content_name`…), dados de usuário disponíveis, se vai ao relay (servidor) e qual conversão do Google Ads/LinkedIn recebe.
3. Sugira eventos novos quando fizer sentido (ex.: `Contact` no botão de WhatsApp, `Schedule` em agenda, `ViewContent` em página de oferta), mas **só implemente o que o usuário aprovar**.

### Fase 3 — Implementação

1. Copie `templates/` para o projeto (sem sobrescrever arquivos existentes sem mostrar o diff):
   - `src/tracking/**` (runtime, catálogo, identidade, parâmetros, plataformas, relay);
   - `src/components/Tracking.astro` → inclua como **primeiro filho do `<body>`** em cada layout;
   - relay: `functions/api/events.ts` (Pages estático) **ou** `workers/src/pages/api/events.ts` → `src/pages/api/events.ts` (adapter Workers);
   - `tests/tracking.spec.ts` e `.dev.vars.example`; garanta `.dev.vars*` e `.env*` no `.gitignore`.
2. Preencha `src/tracking/config.ts`: `hosts` (produção, preview `*.pages.dev`, `localhost`, `127.0.0.1`), `decorateDomains`, IDs, `googleAds.conversions`, `linkedin.conversions`, `consent`, `scroll`, renomeações em `names` (para manter nomes históricos, ex.: GA4 `Lead` em vez de `generate_lead`).
3. Ligue os gatilhos, do mais simples ao mais robusto:
   - clique: `<a data-track="Contact" data-track-content-name="WhatsApp">`;
   - formulário próprio que só envia quando válido: `<form data-track-form="Lead">`;
   - formulário de terceiro via `fetch`: `captureFormSubmissions()` de `src/tracking/form-capture.ts` (lê o próprio envio e a resposta, funciona com redirect, segura a resposta até os eventos saírem);
   - qualquer outro caso: `window.tracking.track('Purchase', { value, currency, order_id }, { email, phone })` ou `document.dispatchEvent(new CustomEvent('tracking:event', { detail }))`.
4. Remova as instalações antigas (GTM, snippets inline, plugins) **somente depois de confirmar com o usuário** e de reproduzir o que elas faziam. Se o GTM precisar ficar, configure `gtm.containerId` e tire do contêiner os pixels que o código passou a carregar.
5. Rode `npm run build` e `npx playwright test tests/tracking.spec.ts`.

### Fase 4 — Relay e tokens na Cloudflare

1. Explique qual token cada plataforma precisa e como gerar (passo a passo em `references/meta.md`, `tiktok.md`, `pinterest.md`, `microsoft.md`).
2. Oriente o cadastro como **secret** seguindo `references/cloudflare.md`, pelo painel ou por comando interativo que o próprio usuário executa (`! npx wrangler pages secret put META_CAPI_TOKEN --project-name <projeto>`). Não peça para colar o token no chat; se ele for colado, não grave em arquivo e recomende gerar outro depois.
3. Lembre do novo deploy após salvar secrets (Pages só aplica em deploys novos).
4. Sem token, o relay aceita o evento e não envia nada: o site nunca quebra por falta de configuração.

### Fase 5 — Persistência de parâmetros

`src/tracking/params.ts` guarda **todo** parâmetro de entrada (exceto dados pessoais e os `trk_*` de controle) por 90 dias, em primeiro e último toque, e o repassa para links internos, domínios em `decorateDomains`, formulários GET, campos ocultos com o mesmo nome (`utm_source`, `first_utm_source`, `landing_page`, `referrer`) e atributos marcados com `data-trk-params`. Detalhes, limites e exceções: `references/params.md`. Valide com a auditoria (seção "Persistência de parâmetros" e "navigation").

### Fase 6 — Validação em cada plataforma

Siga `references/testing.md`. Resumo:

- Meta: Gerenciador de Eventos → Eventos de teste, abra o site com `?trk_test_meta=TEST…`; cada evento deve aparecer como Navegador + Servidor **Desduplicado**, com o mesmo ID.
- TikTok: `?trk_test_tiktok=TEST…` e aba Test Events. Pinterest: `?trk_test_pinterest=1`. GA4: DebugView. Google Ads: diagnóstico da tag e conversões otimizadas. Microsoft: UET Tag Helper.
- Faça **uma conversão real controlada** por formulário/checkout antes de encerrar.
- Rode de novo a auditoria no deploy novo e compare com a da Fase 1.

### Fase 7 — Entrega

- `node <skill>/scripts/scan-secrets.mjs` na raiz do projeto (falha se houver token no que o git publicaria).
- Registre no README do projeto: plataformas, eventos e gatilhos, secrets necessários (nomes, nunca valores), como testar.
- Relate o que mudou em relação ao diagnóstico e o que ficou pendente (ex.: conversão real ainda não validada).
- Commit/push só quando o usuário pedir.

## Armadilhas que já custaram dados

- **Lead preso à mensagem de sucesso.** Provedores que redirecionam após o envio nunca mostram a mensagem; o Lead some. Detecte pela resposta do envio (`form-capture.ts`) ou pela página de obrigado.
- **Lead no clique/submit** conta tentativas rejeitadas. Só dispare quando o provedor confirmar.
- **Provedor do formulário com o mesmo Pixel.** Se a ferramenta de formulário/checkout também envia Lead ao mesmo dataset sem `event_id` comum, o Lead conta em dobro. Desligue um dos lados.
- **GA4 sem `send_to`** manda o evento também para o Google Ads configurado no mesmo gtag.
- **`fb.1` fixo no `_fbp`/`_fbc`** está errado em domínios `.com.br` (o índice é 2). O runtime calcula.
- **`META_TEST_EVENT_CODE` global** desvia *todos* os eventos reais para o teste. Prefira o código por aba (`?trk_test_meta=`) e remova o secret de teste depois.
- **Headless Chrome não dispara o Pixel da Meta** (user agent `HeadlessChrome` é descartado). A auditoria já troca o UA; ao escrever testes próprios contra o Pixel real, faça o mesmo.
- **`MutationObserver` que escreve no DOM observado** entra em laço infinito; só escreva quando o valor mudar.
- **iframe de outro domínio** não pode ser lido; use página de obrigado, webhook ou a integração de API do próprio provedor.

## Referências

| Arquivo | Conteúdo |
| --- | --- |
| `references/audit.md` | Auditoria: script, leitura do relatório, checagem manual |
| `references/events.md` | Catálogo canônico, nomes por plataforma, parâmetros, sugestões por negócio |
| `references/meta.md` | Pixel, API de Conversões, token, fbp/fbc, dedup, teste, EMQ |
| `references/google.md` | gtag sem GTM, GA4, Google Ads, conversões otimizadas, Consent Mode, GTM, Measurement Protocol |
| `references/tiktok.md` · `pinterest.md` · `microsoft.md` · `linkedin.md` | Tag, API de servidor, token e teste de cada plataforma |
| `references/cloudflare.md` | Secrets no Pages e no Workers, `.dev.vars`, logs, rate limit |
| `references/params.md` | Persistência de UTMs e click IDs |
| `references/forms.md` | Gatilhos de conversão por tipo de formulário |
| `references/consent.md` | LGPD/GDPR, Consent Mode v2, CMP |
| `references/testing.md` | Playwright, eventos de teste e checklist final |
