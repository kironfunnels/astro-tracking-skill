# web-tracking — skill de rastreamento direto para sites e apps web

Skill para agentes de código (Claude Code e compatíveis) que audita, instala e mantém o rastreamento de conversões **direto no código**, sem depender do Google Tag Manager. Ela identifica a stack do site e o host e orienta a instalação certa para cada caso.

- **Stacks:** Astro, Next.js, Nuxt, SvelteKit, SPA com Vite (React, Vue, Svelte…), Remix/React Router, Gatsby, HTML estático, WordPress/Elementor, Webflow/Wix/Framer, Shopify e back-ends como Laravel, Rails e Django.
- **Hosts:** Cloudflare (Pages, Workers, Worker standalone em subdomínio), Vercel, Netlify e servidor próprio.
- **Meta:** Pixel + API de Conversões, com deduplicação por `event_id`, `_fbp`/`_fbc` corretos e correspondência avançada.
- **Google:** GA4 e Google Ads via `gtag.js`, conversões otimizadas, Consent Mode v2 e GTM opcional.
- **TikTok** (Pixel + Events API), **Pinterest** (tag + Conversions API), **Microsoft Advertising** (UET + Conversions API) e **LinkedIn** (Insight Tag).
- **Persistência de parâmetros:** UTMs, click IDs e qualquer outro parâmetro seguem para as próximas páginas, checkouts e formulários.
- **Captura confiável de formulários:** a conversão sai da resposta do provedor, funciona com redirect e ignora envios rejeitados.
- **Auditoria** do site publicado (com detecção de stack e bloqueio de disparos por padrão), **recuperação de conversões** perdidas e **testes Playwright**.

O núcleo veio de uma implementação em produção. Foi testado com Astro 7, com o bundle estático (HTML/WordPress) e com Playwright. Os adaptadores de Next.js, Nuxt, SvelteKit, Vercel e Netlify seguem a documentação oficial de cada um e devem ser validados no projeto (build + testes) na instalação. Não há IDs, tokens ou dados de clientes neste repositório.

## Instalação

### Claude Code (plugin)

```text
/plugin marketplace add kironfunnels/web-tracking-skill
/plugin install web-tracking@kironfunnels-tracking
```

### Cópia manual (qualquer agente que leia skills)

```bash
git clone https://github.com/kironfunnels/web-tracking-skill.git
# para um projeto:
cp -r web-tracking-skill/skills/web-tracking <projeto>/.claude/skills/
# ou para todos os projetos do usuário:
cp -r web-tracking-skill/skills/web-tracking ~/.claude/skills/
```

Agentes que usam `.agents/skills/` (Codex e outros) funcionam com a mesma pasta.

## Uso

Peça ao agente, por exemplo:

- "Audite o rastreamento de https://meusite.com.br"
- "Instale Pixel da Meta com API de Conversões e GA4 neste projeto, sem GTM"
- "Meu site é WordPress com Elementor: como envio eventos pelo servidor?"
- "Os UTMs estão chegando no checkout?"
- "A campanha otimiza por Lead e não mostra conversões"

O agente segue o fluxo do `SKILL.md`: contexto e stack → diagnóstico → plano de eventos → implementação → tokens no host → persistência de parâmetros → validação em cada plataforma → entrega.

Os scripts também rodam sozinhos:

```bash
node skills/web-tracking/scripts/detect-stack.mjs ./meu-projeto
node skills/web-tracking/scripts/audit-site.mjs https://meusite.com.br/ --pages 3    # precisa de Playwright
node skills/web-tracking/scripts/scan-secrets.mjs                                   # tokens no que o git publicaria
```

## Estrutura

```
skills/web-tracking/
├── SKILL.md                      # fluxo e regras
├── references/                   # documentação por plataforma, stack e tema (pt-BR, com links oficiais)
├── scripts/
│   ├── detect-stack.mjs          # stack e host do projeto local
│   ├── audit-site.mjs            # auditoria do site publicado (stack, disparos, cookies, parâmetros, segredos)
│   ├── build-bundle.mjs          # tracking.js para sites sem build (HTML, WordPress, Webflow…)
│   ├── scan-secrets.mjs          # verificação de segredos antes do commit
│   └── backfill-meta.mjs         # recuperação de conversões perdidas (API de Conversões, até 7 dias)
└── templates/
    ├── core/tracking/            # runtime do navegador, catálogo, identidade/hash, parâmetros, plataformas e relay
    ├── core/tests/               # testes Playwright
    └── adapters/                 # astro, next, nuxt, sveltekit, static, cloudflare-pages, cloudflare-worker, vercel, netlify
```

## Manutenção

As APIs das plataformas mudam. Cada arquivo em `references/` indica a data da última conferência e os links oficiais. A versão da Graph API da Meta fica em `templates/core/tracking/server/meta.ts` (`META_GRAPH_VERSION`). Correções são bem-vindas via pull request. Nunca inclua IDs ou tokens reais.

## Aviso

Não há vínculo com Meta, Google, TikTok, Pinterest, Microsoft, LinkedIn, Cloudflare, Vercel ou Netlify, nem aval dessas empresas. Consentimento e bases legais (LGPD, GDPR) são responsabilidade de quem publica o site. Veja `references/consent.md`.

## Licença

[MIT](LICENSE)
