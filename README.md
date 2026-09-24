# easy-pixel — skill de rastreamento direto para sites e apps web

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

Há três formas de instalar. Para a maioria das pessoas, a primeira basta.

| Forma | Quando usar |
| --- | --- |
| [1. Comando `npx skills`](#1-comando-npx-skills-recomendado) | Recomendado. Um comando, qualquer agente (Claude Code, Codex, Cursor, Gemini CLI…), atualização fácil |
| [2. Plugin do Claude Code](#2-plugin-do-claude-code) | Quem usa só o Claude Code e prefere o gerenciador de plugins dele |
| [3. Cópia manual](#3-cópia-manual) | Sem Node.js, ou para editar a skill localmente |

Requisitos: forma 1, [Node.js](https://nodejs.org/) 22.20 ou mais recente (exigência do `skills`); forma 3, `git`. Os scripts da skill (auditoria, detecção de stack etc.) rodam com Node.js 18 ou mais recente.

### 1. Comando `npx skills` (recomendado)

Usa o [`skills`](https://www.npmjs.com/package/skills), um instalador aberto de skills para agentes de código. Ele baixa este repositório do GitHub, encontra a skill e a coloca na pasta que cada agente lê.

**No projeto** (a skill fica só neste projeto e pode ir para o git junto com ele). Rode dentro da pasta do projeto:

```bash
npx skills add kironfunnels/easy-pixel
```

O comando pergunta em quais agentes instalar. Para pular as perguntas, informe os agentes:

```bash
npx skills add kironfunnels/easy-pixel -a claude-code -y               # só Claude Code
npx skills add kironfunnels/easy-pixel -a claude-code -a codex -y      # Claude Code e Codex
npx skills add kironfunnels/easy-pixel --all                           # todos os agentes suportados
```

Nomes de agentes mais comuns: `claude-code`, `codex`, `cursor`, `gemini-cli`, `github-copilot`, `windsurf`, `opencode`. A lista completa aparece se você passar um nome inválido em `-a`.

**Para o usuário** (a skill vale em todos os projetos da máquina):

```bash
npx skills add kironfunnels/easy-pixel -g
```

**Onde os arquivos ficam** (instalação no projeto):

```
seu-projeto/
├── .agents/skills/easy-pixel/     # cópia principal (Codex e agentes que seguem o padrão .agents)
├── .claude/skills/easy-pixel/     # link para a pasta acima (Claude Code)
└── skills-lock.json               # origem e hash da versão instalada
```

Versione o `skills-lock.json` se quiser que outras pessoas do time instalem a mesma skill: `npx skills experimental_install` restaura tudo a partir dele.

**Atualizar, listar e remover:**

```bash
npx skills update                  # baixa a versão mais recente do GitHub (use -g para as globais)
npx skills list                    # mostra as skills instaladas
npx skills remove easy-pixel       # remove a skill
```

**Windows:** por padrão a skill é instalada com links simbólicos. Se aparecer erro de permissão ao criar o link, ative o Modo de Desenvolvedor do Windows ou acrescente `--copy` para copiar os arquivos em vez de linkar:

```bash
npx skills add kironfunnels/easy-pixel -a claude-code -y --copy
```

**Ver antes de instalar:** `npx skills add kironfunnels/easy-pixel --list` mostra a skill e a descrição sem instalar nada.

### 2. Plugin do Claude Code

Dentro de uma sessão do Claude Code:

```text
/plugin marketplace add kironfunnels/easy-pixel
/plugin install easy-pixel@kironfunnels-tracking
```

Reinicie a sessão depois de instalar. Como plugin, o comando da skill ganha o prefixo do plugin (`/easy-pixel:easy-pixel`), mas não é preciso chamá-lo: basta pedir em texto (veja [Uso](#uso)). Para atualizar, use `/plugin` e escolha atualizar o marketplace `kironfunnels-tracking`.

Para testar uma cópia local da skill (antes de publicar alterações), aponte o marketplace para a pasta do repositório:

```text
/plugin marketplace add C:\caminho\para\easy-pixel
/plugin install easy-pixel@kironfunnels-tracking
```

### 3. Cópia manual

```bash
git clone https://github.com/kironfunnels/easy-pixel.git

# para um projeto (Claude Code):
cp -r easy-pixel/skills/easy-pixel <projeto>/.claude/skills/
# para um projeto (Codex e agentes que usam .agents):
cp -r easy-pixel/skills/easy-pixel <projeto>/.agents/skills/
# para todos os projetos do usuário (Claude Code):
cp -r easy-pixel/skills/easy-pixel ~/.claude/skills/
```

No Windows (PowerShell), troque `cp -r` por `Copy-Item -Recurse`. Para atualizar, rode `git pull` no clone e copie a pasta de novo.

### Conferir se funcionou

Abra o agente na pasta do projeto e pergunte "quais skills você tem?". A `easy-pixel` deve aparecer na lista. No Claude Code, ela também aparece ao digitar `/`. A skill é acionada sozinha quando o pedido fala de pixel, CAPI, GA4, conversões, UTMs etc.

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
node skills/easy-pixel/scripts/detect-stack.mjs ./meu-projeto
node skills/easy-pixel/scripts/audit-site.mjs https://meusite.com.br/ --pages 3    # precisa de Playwright
node skills/easy-pixel/scripts/scan-secrets.mjs                                   # tokens no que o git publicaria
```

## Estrutura

```
skills/easy-pixel/
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
