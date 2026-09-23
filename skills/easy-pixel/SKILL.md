---
name: easy-pixel
description: Audita, instala e mantém rastreamento de conversões direto no código de sites e apps web, sem depender do Google Tag Manager, identificando a stack (Astro, Next.js, Nuxt, SvelteKit, SPA Vite/React/Vue, Remix, HTML estático, WordPress/Elementor, Webflow, Shopify, Laravel etc.) e o host (Cloudflare, Vercel, Netlify, servidor próprio) para orientar a instalação certa. Cobre Meta Pixel + API de Conversões, GA4, Google Ads (conversões otimizadas), TikTok Pixel + Events API, Pinterest, Microsoft UET e LinkedIn, com event_id compartilhado para deduplicação, relay de servidor com tokens só como secrets, persistência de UTMs e click IDs entre páginas, captura confiável de formulários, auditoria do site publicado, recuperação de conversões e testes Playwright. Use quando pedirem para instalar ou revisar pixel, CAPI, GA4, gtag, Google Ads, TikTok, conversões ou eventos, tirar o GTM, conferir se UTMs/fbclid/gclid chegam às próximas páginas, investigar campanha sem conversões ou auditar o rastreamento de um site.
---

# Rastreamento direto (qualquer stack)

Esta skill conduz o trabalho completo: diagnóstico do que o site tem hoje, identificação da stack, plano de eventos, implementação a partir dos templates, tokens como secrets no host, persistência de parâmetros e validação em cada plataforma. O núcleo foi extraído de uma implementação em produção. Foi testado com Astro 7, bundle estático (HTML/WordPress) e Playwright; os adaptadores das outras stacks seguem a documentação oficial de cada framework e precisam ser validados no projeto (build + testes) ao instalar.

## Princípios que não se negociam

1. **Uma fonte de disparo por evento.** Cada evento sai uma vez do navegador (pixel) e uma vez do servidor (API), com o **mesmo `event_id`**. Nunca deixe o mesmo pixel no GTM, em plugin ou no provedor do formulário *e* no código.
2. **Tokens só como secret do host.** Nunca no repositório, no `config.ts`, em variável pública (`PUBLIC_*`, `NEXT_PUBLIC_*`, `VITE_*`, `NUXT_PUBLIC_*`), em `.env` versionado ou no chat. IDs de pixel/tag são públicos e ficam em `config.ts`.
3. **Dado pessoal sai do navegador só em SHA-256**, normalizado do jeito que cada plataforma documenta (`templates/core/tracking/identity.ts`). E-mail e telefone nunca vão em URL.
4. **Nada é enviado de `localhost`/`127.0.0.1`** a menos que a aba tenha `?trk_enable=1`; testes usam stubs. Nenhum snippet de terceiro fora do runtime em builds locais.
5. **Nunca teste contra produção com dados falsos no navegador.** `test_event_code` só cobre o servidor; click IDs inventados sujam o dataset. Use `?trk_browser_off=1` com os códigos de teste e a auditoria no modo padrão (que bloqueia a entrega).
6. **Documentação oficial vence memória.** Versões de API mudam (ex.: Graph API v26.0 em 2026-07). Antes de implementar, confira as páginas listadas em cada `references/<plataforma>.md` e atualize constantes se preciso.
7. **Não invente dados comerciais.** Valor, moeda, nome de produto e quais conversões otimizar vêm do usuário.

## Fluxo

Siga as fases em ordem. Ao final de cada fase, mostre ao usuário o resultado resumido antes de avançar quando houver decisão dele.

### Fase 0 — Contexto e stack

1. **Identifique a stack.** Com o código: `node <skill>/scripts/detect-stack.mjs` (framework, modo de renderização, host, rastreamento já instalado e recomendação de templates). Só com o site: a seção "Stack detectada" da auditoria (Fase 1). Confirme com o usuário onde o site é publicado e se ele controla código e servidor.
2. Pergunte só o que faltar:
   - URL publicada (e preview/staging) e rotas em escopo;
   - plataformas desejadas e IDs públicos: Pixel da Meta, GA4 `G-…`, Google Ads `AW-…` + rótulos, TikTok, Pinterest (tag + conta de anúncios), UET, LinkedIn (partner + conversion IDs);
   - consentimento: sem banner (`consent: 'none'`) ou banner/CMP (`'opt-in'`), ver `references/consent.md`;
   - formulários e checkouts: provedor, se redireciona após o envio, se roda em iframe, se já manda eventos ao mesmo Pixel (`references/forms.md`).
3. Consulte `references/stacks.md` e decida com o usuário: onde o núcleo entra, como o runtime carrega, qual relay (rota do framework, função do host ou Worker em subdomínio) e se `spa: true`.

### Fase 1 — Diagnóstico do estado atual

1. Rode a auditoria no site publicado (de uma pasta com Playwright instalado):
   ```bash
   node <skill>/scripts/audit-site.mjs https://site.com/pagina/ --pages 3 --json reports/tracking-audit.json
   ```
   Por padrão ela registra e **bloqueia** todos os disparos (os click IDs de teste nunca chegam às plataformas); `--live` entrega de verdade, sem click IDs falsos. Relata stack e host, tags no HTML, disparos reais na rede (Pixel, GA4, Ads, TikTok, Pinterest, UET, LinkedIn, Clarity, Hotjar), POSTs para o próprio domínio (relay), cookies, persistência de parâmetros, formulários, iframes, erros de console e **segredos expostos**. Leitura do relatório: `references/audit.md`.
2. Leia o código: `grep -rE "fbq|gtag|GTM-|ttq|pintrk|uetq|lintrk|dataLayer|graph.facebook"` fora de `node_modules` e das pastas de build.
3. Se houver MCP da Meta ou do Google disponível, consulte a qualidade do dataset e dos eventos (EMQ, deduplicação, amostras de atividades). Caso contrário, peça prints do Gerenciador de Eventos.
4. Entregue uma tabela: **plataforma | instalada? | como (GTM, inline, plugin, app) | eventos vistos | dedup | problemas**, seguida dos achados críticos (token exposto, evento em dobro, Lead que nunca dispara, parâmetros perdidos).

### Fase 2 — Plano de eventos

1. Mapeie a jornada (entrada → interação → conversão → pós-conversão) e proponha eventos com base em `references/events.md` (catálogo canônico, nome em cada plataforma, sugestões por tipo de negócio).
2. Para cada evento defina: gatilho exato, parâmetros (`value`, `currency`, `content_name`…), dados de usuário disponíveis, se vai ao relay e qual conversão do Google Ads/LinkedIn recebe.
3. Sugira eventos novos quando fizer sentido (ex.: `Contact` no botão de WhatsApp, `Schedule` em agenda, `ViewContent` em página de oferta), mas **só implemente o que o usuário aprovar**.

### Fase 3 — Implementação

1. Copie `templates/core/tracking` para o lugar indicado em `references/stacks.md` e os adaptadores da stack e do host (`templates/adapters/…`), sem sobrescrever arquivos existentes sem mostrar o diff. Copie `templates/core/tests/tracking.spec.ts` (ajuste os imports) e `.dev.vars.example` quando o host for Cloudflare; garanta `.dev.vars*` e `.env*` no `.gitignore`.
2. Preencha `config.ts`:
   - `hosts`: produção, previews, `localhost`, `127.0.0.1`;
   - `decorateDomains`, `endpoint` (URL absoluta se o relay estiver em subdomínio) e `spa`;
   - IDs, `googleAds.conversions`, `linkedin.conversions`, `consent`, `scroll`;
   - `names` para manter nomes históricos (ex.: GA4 `Lead` em vez de `generate_lead`).
3. Ligue os gatilhos, do mais simples ao mais robusto:
   - clique: `<a data-track="Contact" data-track-content-name="WhatsApp">`;
   - formulário próprio que só envia quando válido: `<form data-track-form="Lead">`;
   - formulário de terceiro via `fetch`: `captureFormSubmissions()` de `form-capture.ts` (no bundle estático, `window.trackingForms.capture(...)`). Ele lê o próprio envio e a resposta, funciona com redirect e segura a resposta até os eventos saírem;
   - qualquer outro caso: `window.tracking.track('Purchase', { value, currency, order_id }, { email, phone })` ou `document.dispatchEvent(new CustomEvent('tracking:event', { detail }))`.
4. Remova as instalações antigas (GTM, snippets inline, plugins) **somente depois de confirmar com o usuário** e de reproduzir o que elas faziam. Se o GTM precisar ficar, configure `gtm.containerId` e tire do contêiner os pixels que o código passou a carregar.
5. Rode o build do projeto e os testes de rastreamento. Corrija erros de tipo ou de caminho de import dos adaptadores no próprio projeto.

### Fase 4 — Relay e tokens

1. Explique qual token cada plataforma precisa e como gerar (`references/meta.md`, `tiktok.md`, `pinterest.md`, `microsoft.md`).
2. Oriente o cadastro como **secret** no host: Cloudflare em `references/cloudflare.md`, Vercel, Netlify e servidores próprios em `references/stacks.md` §3. Prefira o painel ou um comando interativo que o próprio usuário executa (no Claude Code, com prefixo `!`). Não peça para colar o token no chat; se ele for colado, não grave em arquivo e recomende gerar outro depois.
3. Lembre do novo deploy após salvar secrets.
4. Sem token, o relay aceita o evento e não envia nada: o site nunca quebra por falta de configuração.

### Fase 5 — Persistência de parâmetros

`params.ts` guarda **todo** parâmetro de entrada (exceto dados pessoais e os `trk_*` de controle) por 90 dias, em primeiro e último toque, e o repassa para links internos, domínios em `decorateDomains`, formulários GET, campos ocultos com o mesmo nome (`utm_source`, `first_utm_source`, `landing_page`, `referrer`) e atributos marcados com `data-trk-params`. Detalhes: `references/params.md`. Valide com a auditoria (seções "Persistência de parâmetros" e "navigation").

### Fase 6 — Validação em cada plataforma

Siga `references/testing.md`. Resumo:

- Meta: Gerenciador de Eventos → Eventos de teste, abra o site com `?trk_test_meta=TEST…`. O PageView deve aparecer como Navegador + Servidor **Desduplicado**, com o mesmo ID. Para testar a **conversão** sem criar evento real de navegador, acrescente `&trk_browser_off=1`. Depois confira as Amostras de atividades e as configurações do dataset (`references/troubleshooting.md`).
- TikTok: `?trk_test_tiktok=TEST…` e aba Test Events. Pinterest: `?trk_test_pinterest=1`. GA4: DebugView. Google Ads: diagnóstico da tag e das conversões otimizadas. Microsoft: UET Tag Helper.
- Faça **uma conversão real controlada** antes de encerrar, idealmente também pelo navegador interno do Instagram quando o tráfego vier de lá.
- Rode de novo a auditoria no deploy novo e compare com a da Fase 1. Se a campanha não mostrar conversões depois de 30 min, siga `references/troubleshooting.md`.

### Fase 7 — Entrega

- `node <skill>/scripts/scan-secrets.mjs` na raiz do projeto (falha se houver token no que o git publicaria).
- Registre no README do projeto: plataformas, eventos e gatilhos, secrets necessários (nomes, nunca valores), como testar.
- Relate o que mudou em relação ao diagnóstico e o que ficou pendente (ex.: conversão real ainda não validada).
- Commit/push só quando o usuário pedir.

## Armadilhas que já custaram dados

- **Lead preso à mensagem de sucesso.** Provedores que redirecionam após o envio nunca mostram a mensagem, e o Lead some. Detecte pela resposta do envio (`form-capture.ts`) ou pela página de obrigado.
- **Lead no clique/submit** conta tentativas rejeitadas. Só dispare quando o provedor confirmar.
- **Provedor do formulário com o mesmo Pixel.** Sem `event_id` comum, o Lead conta em dobro. Desligue um dos lados.
- **Cópia de servidor por `fetch` keepalive** some no redirect dentro do navegador do Instagram. O runtime usa `sendBeacon`.
- **O Pixel só aceita e-mail/telefone no primeiro `fbq('init')`.** Re-init e `setUserData` são ignorados; os dados da conversão chegam pela cópia de servidor, que é obrigatória.
- **`test_event_code` não cobre o Pixel do navegador.** Conversão de teste na página real vira evento real. Use `?trk_browser_off=1` ou aborte os hits dos pixels.
- **`fbclid` inventado em teste de produção** faz a Meta acusar "fbclid modificado".
- **Domínio desconhecido enviando para o seu Pixel:** não confirme; use a lista de domínios permitidos em Permissões de tráfego.
- **GA4 sem `send_to`** manda o evento também para o Google Ads configurado no mesmo gtag.
- **`fb.1` fixo no `_fbp`/`_fbc`** está errado em domínios `.com.br` (o índice é 2). O runtime calcula.
- **SPA sem `spa: true`** registra só o primeiro PageView; **SPA com o PageView automático da Meta** gera PageView sem `eventID` (o runtime desliga com `disablePushState`).
- **Relay fora do domínio registrável** não recebe os cookies `_fbp`/`_fbc`/`_ttp`.
- **Arquivo JS servido sem charset** quebra expressões com caracteres não ASCII; o `build-bundle.mjs` gera ASCII.
- **Headless Chrome não dispara o Pixel da Meta** (user agent `HeadlessChrome`). A auditoria já troca o UA.
- **`META_TEST_EVENT_CODE` global** desvia todos os eventos reais para o teste. Use o código por aba.
- **`MutationObserver` que escreve no DOM observado** entra em laço infinito.
- **iframe de outro domínio** não pode ser lido; use página de obrigado, webhook ou a integração de API do provedor.

## Referências

| Arquivo | Conteúdo |
| --- | --- |
| `references/stacks.md` | Detecção de stack, matriz de instalação por framework/host, segredos por host, IP/geo |
| `references/audit.md` | Auditoria: script, leitura do relatório, checagem manual |
| `references/events.md` | Catálogo canônico, nomes por plataforma, parâmetros, sugestões por negócio |
| `references/meta.md` | Pixel, API de Conversões, token, fbp/fbc, dedup, teste, EMQ |
| `references/google.md` | gtag sem GTM, GA4, Google Ads, conversões otimizadas, Consent Mode, GTM, Measurement Protocol |
| `references/tiktok.md` · `pinterest.md` · `microsoft.md` · `linkedin.md` | Tag, API de servidor, token e teste de cada plataforma |
| `references/cloudflare.md` | Secrets no Pages e no Workers, Worker standalone, logs, rate limit |
| `references/params.md` | Persistência de UTMs e click IDs |
| `references/forms.md` | Gatilhos de conversão por tipo de formulário |
| `references/consent.md` | LGPD/GDPR, Consent Mode v2, CMP |
| `references/testing.md` | Playwright, eventos de teste e checklist final |
| `references/troubleshooting.md` | Campanha sem conversões: roteiro de diagnóstico, avisos do Gerenciador de Eventos, backfill |

Scripts:
- `scripts/detect-stack.mjs`: stack do projeto local.
- `scripts/audit-site.mjs`: auditoria do site publicado, com stack.
- `scripts/build-bundle.mjs`: `tracking.js` para sites sem build.
- `scripts/scan-secrets.mjs`: segredos no repositório.
- `scripts/backfill-meta.mjs`: recuperar conversões perdidas, até 7 dias.
