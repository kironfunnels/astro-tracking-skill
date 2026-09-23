# Instalação por stack

O núcleo (`templates/core/tracking`) é TypeScript sem dependências e roda igual em qualquer stack:

- o **runtime do navegador** (`client.ts`) só precisa ser carregado uma vez por página ou app;
- o **relay** (`server/relay.ts` → `handleRelay(request, env, waitUntil?, client?)`) só precisa de um `Request` padrão da Web, então funciona em qualquer servidor moderno.

Cada stack muda apenas três coisas: **onde copiar o núcleo**, **como carregar o runtime** e **qual arquivo expõe o relay**. Os adaptadores prontos estão em `templates/adapters/`.

## 1. Detectar

- Projeto local: `node <skill>/scripts/detect-stack.mjs` (framework, modo de renderização, host e rastreamento já instalado).
- Só o site publicado: a auditoria (`audit-site.mjs`) mostra a seção **Stack detectada** a partir do HTML e dos cabeçalhos (Astro, Next.js, Nuxt, SvelteKit, Gatsby, WordPress, Elementor, Shopify, Wix, Webflow, Framer; Cloudflare, Vercel, Netlify).
- Confirme com o usuário **onde o site é publicado** e se ele controla o código e o servidor. A detecção é indício, não certeza.

## 2. Matriz

| Stack | Copiar o núcleo para | Carregar o runtime | Relay | `spa` |
| --- | --- | --- | --- | --- |
| **Astro** estático | `src/tracking` | `adapters/astro/components/Tracking.astro` como 1º filho do `<body>` no layout | Cloudflare Pages: `adapters/cloudflare-pages/functions/api/events.ts`; Vercel: `adapters/vercel/api/events.ts`; Netlify: `adapters/netlify/...` | `false` (ou `true` com `<ClientRouter />`) |
| **Astro** com adapter | `src/tracking` | idem | `src/pages/api/events.ts` a partir de `adapters/astro/cloudflare-workers/events.ts` (Cloudflare) ou `adapters/astro/other-hosts/events.ts` (Vercel, Netlify, Node) | idem |
| **Next.js** App Router | `src/tracking` ou `tracking` (irmão de `app/`) | `adapters/next/components/Tracking.tsx` dentro do `<body>` em `app/layout.tsx` | `adapters/next/app/api/events/route.ts` (usa `after()`, Next 15.1+) | `true` |
| **Next.js** Pages Router | idem | `useEffect` em `pages/_app.tsx` com `import('../tracking/client')` | Route Handler não existe no Pages Router: crie `app/api/events/route.ts` (os dois roteadores convivem) ou use o relay do host | `true` |
| **Next.js** `output: 'export'` | idem | idem | Sem rotas de API: relay do host (Cloudflare Pages Functions, Netlify, Vercel `api/`) ou Worker | `true` |
| **Nuxt** 3/4 | pasta coberta pelo alias `~` (Nuxt 4: `app/tracking`) ou `shared/tracking` | `adapters/nuxt/plugins/tracking.client.ts` | `adapters/nuxt/server/api/events.ts` (ajuste o import; no Cloudflare use `event.context.cloudflare.env`) | `true` |
| **SvelteKit** | `src/lib/tracking` | `adapters/sveltekit/hooks.client.ts` | `adapters/sveltekit/routes/api/events/+server.ts` | `true` |
| **Vite SPA** (React, Vue, Svelte, Solid, Preact), Angular, Gatsby | `src/tracking` | `import './tracking/client'` no `main.ts` (Gatsby: `gatsby-browser.js`) | relay do host: Cloudflare Pages, Vercel `api/`, Netlify | `true` |
| **Remix / React Router** | `app/tracking` | `import('./tracking/client')` num `useEffect` do `root.tsx` | rota de recurso `app/routes/api.events.ts` com `export const action = ({ request }) => handleRelay(request, process.env)` | `true` |
| **HTML estático** em qualquer host | pasta `tracking/` fora do site publicado | `node <skill>/scripts/build-bundle.mjs --tracking ./tracking --out ./public/tracking.js` e `<script src="/tracking.js" defer></script>` no `<head>` | relay do host (se tiver funções) ou `adapters/cloudflare-worker` | `false` |
| **WordPress / Elementor** | fora do tema, só para o build | `tracking.js` gerado pelo `build-bundle.mjs`, enfileirado no tema filho (`wp_enqueue_script('tracking', get_stylesheet_directory_uri() . '/tracking.js', [], null, ['strategy' => 'defer', 'in_footer' => false])`) ou por um plugin de código no `<head>` | `adapters/cloudflare-worker` (rota `site.com/api/events*` se o domínio estiver na Cloudflare, ou `track.site.com`) | `false` |
| **Webflow / Wix / Framer** | fora da plataforma | `tracking.js` hospedado (ex.: no próprio Worker ou em um CDN) e colado em "custom code" do `<head>` | `adapters/cloudflare-worker` em `track.site.com` | `false` |
| **Shopify** | — | Prefira os apps oficiais (Meta, Google & YouTube, TikTok), que já fazem API de servidor e dedup. Use o runtime só para eventos extras via Customer Events (pixels personalizados) e revise duplicidade | apps oficiais | — |
| **Laravel / Rails / Django / PHP** | onde o bundler do projeto enxerga, ou só para o `build-bundle.mjs` | bundle incluído no layout base | rota própria que converte a requisição e chama as APIs (a lógica de `server/*.ts` serve de especificação) ou `adapters/cloudflare-worker` | `false` (ou `true` com Turbo/Inertia/htmx boost) |

Regras que valem para todas as linhas:

- **O relay precisa estar no mesmo domínio registrável do site** (mesma origem ou subdomínio), senão o navegador não envia `_fbp`, `_fbc` e `_ttp` e a correspondência cai. Com relay em subdomínio, `tracking.endpoint` recebe a URL absoluta e o relay responde CORS apenas para `tracking.hosts`.
- **`spa: true`** quando a navegação acontece sem recarregar a página. O runtime registra o `PageView` a cada troca de rota, reinicia a rolagem e chama `ttq.page()`/`pintrk('page')`. O GA4 conta essas trocas sozinho se a medição otimizada "Alterações de página com base em eventos do histórico do navegador" estiver ligada; o UET faz o mesmo com `enableAutoSpaTracking`. O `PageView` automático da Meta em `pushState` é desligado (`fbq.disablePushState = true`) porque sairia sem `eventID`.
- **Os imports dos adaptadores assumem os caminhos da coluna 2.** Ajuste se o projeto usar outro layout. O `tests/tracking.spec.ts` importa `../src/tracking/...`.
- **Build estático sem JavaScript próprio:** o `build-bundle.mjs` usa esbuild via `npx` e gera arquivo ASCII (sem risco de charset errado no servidor).

## 3. Onde ficam os segredos, por host

| Host | Onde cadastrar | Observação |
| --- | --- | --- |
| Cloudflare Pages / Workers | `cloudflare.md` | Tipo **Secret**; novo deploy no Pages |
| Vercel | Project → **Settings → Environment Variables**, marcando **Sensitive**, ambiente Production | Redeploy após salvar. CLI: `vercel env add META_CAPI_TOKEN production` (o valor é pedido de forma interativa) |
| Netlify | Site configuration → **Environment variables**, escopo **Functions**, com "Contains secret values" | Redeploy. Prefira o painel para o valor não passar pelo histórico do shell |
| Node / VPS / Docker | variável de ambiente do processo (gerenciador de segredos do provedor, `systemd` `EnvironmentFile` com permissão 600, secrets do Docker/Kubernetes) | Nunca `.env` versionado |
| SvelteKit (Node) | `$env/dynamic/private` lê as variáveis do processo | — |

Em todos os casos o token nunca vai para variável pública (`PUBLIC_*`, `NEXT_PUBLIC_*`, `VITE_*`, `NUXT_PUBLIC_*`), que acaba no JavaScript do navegador.

## 4. IP e localização do visitante

`clientInfo()` lê, em ordem: `cf-connecting-ip` + `request.cf` (Cloudflare), `x-vercel-forwarded-for`/`x-real-ip` + `x-vercel-ip-*` (Vercel) e `x-forwarded-for`. Na Netlify, o adaptador passa `context.ip` e `context.geo`; no SvelteKit com Cloudflare, `platform.cf`. Atrás de outro proxy ou CDN, garanta que o IP real chegue (ex.: `trust proxy` no Express) e passe-o no 4º argumento de `handleRelay`.

## 5. Quando não instalar o runtime

- A plataforma já tem integração oficial de servidor bem configurada (Shopify, alguns checkouts e CRMs). Audite, confirme a deduplicação e use o runtime só onde houver lacuna.
- O cliente exige manter tudo no GTM, inclusive server-side (sGTM). A skill ainda serve para auditar, planejar eventos, persistir parâmetros e validar; os adaptadores de relay não são necessários.
