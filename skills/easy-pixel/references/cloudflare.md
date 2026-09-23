# Cloudflare — relay e tokens como secrets

Conferido em 2026-09.

- Bindings, variáveis e secrets no Pages: https://developers.cloudflare.com/pages/functions/bindings/
- Adapter Astro para Cloudflare: https://docs.astro.build/en/guides/integrations-guide/cloudflare/
- Secrets no Workers: https://developers.cloudflare.com/workers/configuration/secrets/

## Qual entrada usar

| Como o site é publicado | Arquivo do relay | Observação |
| --- | --- | --- |
| Qualquer site estático no **Cloudflare Pages** (Astro sem adapter, Vite SPA, Next `export`, HTML) | `functions/api/events.ts` (de `templates/adapters/cloudflare-pages`) | Pages Functions: a pasta `functions/` na raiz vira rotas. O relay importa `src/tracking/server/relay.ts`. |
| Astro com `@astrojs/cloudflare` (Astro 6+) no **Cloudflare Workers** | `src/pages/api/events.ts` (de `templates/adapters/astro/cloudflare-workers`) | O adapter atual publica só em Workers e ignora `functions/`. Env por `import { env } from 'cloudflare:workers'`, `waitUntil` por `Astro.locals.cfContext`. `export const prerender = false`. |
| SvelteKit/Nuxt/Next (OpenNext) no Cloudflare | adaptador do framework (`references/stacks.md`) | Env e `waitUntil` vêm do contexto do framework (`platform.env/ctx`, `event.context.cloudflare`). |
| Site que não roda código próprio (WordPress, Webflow, Wix, HTML em outro host) | **Worker standalone** em `templates/adapters/cloudflare-worker` | Rota `site.com/api/events*` (domínio já na Cloudflare) ou domínio próprio `track.site.com`. Com subdomínio, `tracking.endpoint` recebe a URL absoluta e o relay responde CORS só para `tracking.hosts`. Publique com `npx wrangler deploy`. |
| Vercel, Netlify, servidor próprio | `references/stacks.md` | Mesmo `handleRelay`; IP/geo lidos dos cabeçalhos de cada host. |

O relay responde `204` na hora e envia às plataformas em segundo plano (`waitUntil`). Sem token de uma plataforma, ela é ignorada; sem nenhum token, nada é enviado e o site continua funcionando.

## Nomes dos secrets

| Secret | Obrigatório para | Onde gerar |
| --- | --- | --- |
| `META_CAPI_TOKEN` | API de Conversões da Meta | `meta.md` |
| `TIKTOK_EVENTS_TOKEN` | Events API do TikTok | `tiktok.md` |
| `PINTEREST_CONVERSIONS_TOKEN` | Conversions API do Pinterest | `pinterest.md` |
| `MICROSOFT_CAPI_TOKEN` | UET Conversions API | `microsoft.md` |
| `META_TEST_EVENT_CODE`, `TIKTOK_TEST_EVENT_CODE` | Só durante teste; desviam **todos** os eventos | Remover após validar |

## Cadastrar no Cloudflare Pages (painel)

1. dash.cloudflare.com → **Workers & Pages** → selecione o projeto Pages.
2. **Settings → Variables and Secrets → Add**.
3. **Type: Secret** (valor criptografado, não aparece de novo), **Variable name:** `META_CAPI_TOKEN`, **Value:** o token.
4. Escolha o ambiente: **Production** (e **Preview** só se quiser enviar eventos reais de previews — normalmente não).
5. **Save**.
6. **Faça um novo deploy** (Deployments → no último deploy de produção, *Retry deployment*, ou um novo commit). Secrets só valem para deploys criados depois.

## Cadastrar pela linha de comando

O usuário executa (o valor é pedido de forma interativa e não fica no histórico do shell):

```bash
npx wrangler login
npx wrangler pages secret put META_CAPI_TOKEN --project-name <nome-do-projeto>
npx wrangler pages secret list --project-name <nome-do-projeto>
```

No Workers (adapter): `npx wrangler secret put META_CAPI_TOKEN` e `npx wrangler secret list`. Pelo painel: Workers & Pages → o Worker → **Settings → Variables and Secrets → Add → Secret** (o painel publica uma nova versão).

No Claude Code, sugira que o usuário rode o comando com o prefixo `!` para o token não passar pelo chat.

## Desenvolvimento local

- O servidor de desenvolvimento do framework (`astro dev`, `vite`) não executa `functions/`. Para testar o relay de verdade: `npm run build && npx wrangler pages dev dist` (Pages) ou `astro dev` com o adapter (Workers).
- Secrets locais em `.dev.vars` (copie de `.dev.vars.example`). **`.dev.vars*` e `.env*` precisam estar no `.gitignore`.**
- Abra com `?trk_enable=1` para ligar o rastreamento em localhost. Prefira usar códigos de teste para não sujar dados reais.

## Logs

- Pages: `npx wrangler pages deployment tail --project-name <projeto>` ou painel → Deployments → deploy → **Functions → Real-time logs**.
- Workers: `npx wrangler tail` ou painel → **Logs**.
- O relay registra `[relay] <plataforma> <status> <resposta>` para cada erro das APIs (token inválido, campo rejeitado).

## Modelo de ameaça do relay

Um relay chamado pelo navegador é público por natureza: qualquer cliente HTTP pode montar um POST com `Origin` e `event_source_url` válidos. Nenhuma autenticação impede isso sem um backend que confirme cada evento. O relay garante: só eventos do catálogo, só dados de usuário em SHA-256, URLs e referrer sanitizados de novo no servidor, limites de tamanho e origem conferida quando o navegador a envia. Ele **não** garante que o evento aconteceu nem que o consentimento declarado pela página é verdadeiro. Por isso:

- **conversões de valor** (compra, assinatura, lead qualificado) devem sair do backend que confirma a transação, com `event_id` estável (ex.: derivado do pedido);
- use **rate limiting** no caminho do relay (abaixo) e acompanhe picos no Gerenciador de Eventos;
- a Meta tem Permissões de tráfego (lista de domínios) para o Pixel, mas a API de Conversões aceita qualquer chamada com o token, que por isso nunca pode vazar.

## Custos e proteção

- Cada evento relayado é uma invocação. No plano Workers Free (que o Pages Functions compartilha), o limite diário de requisições é baixo para sites de muito tráfego. Opções: plano pago do Workers, ou `tracking.browserOnlyEvents: ['PageView']` para manter só as conversões no servidor.
- O relay já recusa origem fora de `tracking.hosts`, eventos fora do catálogo, corpo acima de 16 KB e dados de usuário que não sejam SHA-256. Para limitar abuso, crie uma regra de **rate limiting** no WAF para o caminho `/api/events` (ex.: 60 requisições por 10 s por IP): painel da zona → **Security → WAF → Rate limiting rules**.
- `hosts` deve listar o domínio de produção, o `*.pages.dev`/`*.workers.dev` do projeto e `localhost`/`127.0.0.1` (necessários para os testes).
