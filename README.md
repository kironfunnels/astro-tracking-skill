# astro-tracking — skill de rastreamento direto para sites Astro

Skill para agentes de código (Claude Code e compatíveis) que audita, instala e mantém o rastreamento de conversões **direto no código** de sites Astro, sem depender do Google Tag Manager.

- **Meta:** Pixel + API de Conversões, com deduplicação por `event_id`, `_fbp`/`_fbc` corretos e correspondência avançada.
- **Google:** GA4 e Google Ads via `gtag.js`, conversões otimizadas, Consent Mode v2 e GTM opcional.
- **TikTok** (Pixel + Events API), **Pinterest** (tag + Conversions API), **Microsoft Advertising** (UET + Conversions API) e **LinkedIn** (Insight Tag).
- **Relay na Cloudflare** (Pages Functions ou Workers). Os tokens ficam só como secrets criptografados.
- **Persistência de parâmetros:** UTMs, click IDs e qualquer outro parâmetro seguem para as próximas páginas, checkouts e formulários.
- **Captura confiável de formulários:** a conversão sai da resposta do provedor, funciona com redirect e ignora envios rejeitados.
- **Auditoria automática** do site publicado e **testes Playwright**.

Os templates vieram de uma implementação em produção e foram testados com Astro 7, Chromium e Playwright. Não há IDs, tokens ou dados de clientes neste repositório.

## Instalação

### Claude Code (plugin)

```text
/plugin marketplace add kironfunnels/astro-tracking-skill
/plugin install astro-tracking@kironfunnels-tracking
```

### Cópia manual (qualquer agente que leia skills)

```bash
git clone https://github.com/kironfunnels/astro-tracking-skill.git
# para um projeto:
cp -r astro-tracking-skill/skills/astro-tracking <projeto>/.claude/skills/
# ou para todos os projetos do usuário:
cp -r astro-tracking-skill/skills/astro-tracking ~/.claude/skills/
```

Agentes que usam `.agents/skills/` (Codex e outros) funcionam com a mesma pasta.

## Uso

Peça ao agente, por exemplo:

- "Audite o rastreamento de https://meusite.com.br"
- "Instale Pixel da Meta com API de Conversões e GA4 neste projeto Astro, sem GTM"
- "Os UTMs estão chegando no checkout?"
- "Crie um evento de Contact para o botão do WhatsApp"

O agente segue o fluxo do `SKILL.md`: contexto → diagnóstico → plano de eventos → implementação → tokens na Cloudflare → persistência de parâmetros → validação em cada plataforma → entrega.

A auditoria também roda sozinha, da raiz de um projeto com Playwright:

```bash
node skills/astro-tracking/scripts/audit-site.mjs https://meusite.com.br/ --pages 3
node skills/astro-tracking/scripts/scan-secrets.mjs   # procura tokens no que o git publicaria
```

## Estrutura

```
skills/astro-tracking/
├── SKILL.md                      # fluxo e regras
├── references/                   # documentação por plataforma e tema (pt-BR, com links oficiais)
├── scripts/
│   ├── audit-site.mjs            # auditoria do site publicado
│   └── scan-secrets.mjs          # verificação de segredos antes do commit
└── templates/                    # código copiado para o projeto Astro
    ├── src/tracking/             # runtime, catálogo, identidade/hash, parâmetros, plataformas, relay
    ├── src/components/Tracking.astro
    ├── functions/api/events.ts   # relay para Cloudflare Pages (site estático)
    ├── workers/src/pages/api/events.ts  # relay para Astro + @astrojs/cloudflare (Workers)
    ├── tests/tracking.spec.ts
    └── .dev.vars.example
```

## Manutenção

As APIs das plataformas mudam. Cada arquivo em `references/` indica a data da última conferência e os links oficiais. A versão da Graph API da Meta fica em `templates/src/tracking/server/meta.ts` (`META_GRAPH_VERSION`). Contribuições com correções de documentação são bem-vindas via pull request. Nunca inclua IDs ou tokens reais.

## Aviso

Não há vínculo com Meta, Google, TikTok, Pinterest, Microsoft, LinkedIn ou Cloudflare, nem aval dessas empresas. Consentimento e bases legais (LGPD, GDPR) são responsabilidade de quem publica o site. Veja `references/consent.md`.

## Licença

[MIT](LICENSE)
