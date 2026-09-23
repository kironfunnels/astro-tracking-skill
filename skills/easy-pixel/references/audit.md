# Auditoria do estado atual

## Script

```bash
# da raiz de um projeto que tenha Playwright (npm i -D @playwright/test && npx playwright install chromium)
node <skill>/scripts/audit-site.mjs https://site.com/pagina/ --pages 3 --wait 4000 --json reports/tracking-audit.json
# sem Playwright (só lê o HTML):
node <skill>/scripts/audit-site.mjs https://site.com/ --static
# entregando os disparos de verdade (sem click IDs falsos):
node <skill>/scripts/audit-site.mjs https://site.com/ --live
```

**Modo padrão (dry):** todos os disparos para as plataformas e **todo POST/beacon** (inclusive para um relay em subdomínio) são registrados e **bloqueados**; nada chega à Meta, ao Google etc. Isso é obrigatório porque a auditoria usa click IDs inventados, e a Meta marca um `fbclid` que não emitiu como "modificado" no diagnóstico do dataset. **`--live`** deixa os disparos passarem e retira os click IDs falsos; use só para confirmar entrega, de preferência com código de teste.

O que ele faz:

1. Abre a URL com parâmetros de teste (`utm_*=…audit…`, `fbclid`, `gclid`, `ttclid`, `msclkid`, `custom_param`) num Chromium com user agent de Chrome comum (o Pixel da Meta descarta `HeadlessChrome`).
2. Espera, rola a página inteira (dispara eventos de rolagem/visibilidade) e registra toda requisição para Meta, Google (GA4, Ads, gtag.js, GTM), TikTok, Pinterest, Microsoft UET, LinkedIn, Clarity e Hotjar — lendo query string, corpo urlencoded em lote (GA4) e multipart (Meta).
3. Coleta: objetos globais (`fbq`, `gtag`, `dataLayer`, `ttq`, `pintrk`, `uetq`, `lintrk`, contêineres do `google_tag_manager`, IDs de Pixel ativos), eventos do `dataLayer`, POSTs para o próprio domínio (relay existente), cookies de rastreamento, formulários (campos e ocultos), iframes, erros de console.
4. Verifica a persistência: quantos links internos têm todos os parâmetros; depois abre até `--pages` links internos **sem** parâmetros e confere se os links dessas páginas ainda carregam `utm_campaign` de teste.
5. Procura segredos no HTML e nos scripts carregados (token da Meta `EAA…`, token do Pinterest, `api_secret`, `access_token=`).
6. Imprime os achados e o detalhe em Markdown; `--json` grava o relatório completo.

Nada é enviado em formulários. No modo `--live`, os disparos são reais e aparecem nas plataformas com `utm_source=trk_audit`, fáceis de filtrar.

## Como ler

| Sinal | Significado |
| --- | --- |
| `Meta Pixel: … SEM eventID` | Sem deduplicação possível com a API de Conversões |
| Nenhum POST para o próprio domínio | Não há relay/CAPI próprio (pode existir via GTM server-side ou integração de parceiro; pergunte) |
| `googleTagManagerContainers` com `GTM-…` e pixels também no código | Risco de evento em dobro; inspecione o contêiner |
| Mais de um ID em `metaPixelIds` | Outro Pixel na página (provedor de formulário, plugin, agência antiga) |
| `_fbc` ausente após chegar com `fbclid` | Clique da Meta não é atribuído |
| `_gcl_aw` ausente com `gclid` | Conversion linker/consentimento bloqueando |
| `navigation[].withParams = 0` | Parâmetros perdidos na segunda página |
| iframes de outro domínio | Formulário não observável pela página |
| `exposedSecrets` não vazio | **Crítico**: revogue o token e mova para secret |

## Complementos manuais

- **Código:** `grep -rnE "fbq\(|gtag\(|GTM-|ttq\.|pintrk\(|uetq|lintrk|dataLayer|graph\.facebook|business-api\.tiktok" --include=*.{astro,ts,js,mjs,html} . | grep -v node_modules`.
- **GTM:** se houver contêiner, peça acesso ou exporte o JSON (Admin → Exportar contêiner) e liste tags, acionadores e variáveis que precisam ser reproduzidos.
- **Formulário:** siga o checklist de `forms.md` (provedor, redirect, campos, pixel próprio do provedor).
- **Plataformas:** Gerenciador de Eventos da Meta (eventos recebidos, deduplicação, EMQ, avisos de dado pessoal em URL), GA4 Tempo real, diagnóstico de conversões do Google Ads, Events Manager do TikTok. Se houver MCP da plataforma conectado, use-o para ler datasets e qualidade de eventos.
- **Mobile:** repita a auditoria de uma página com layout diferente no celular se os gatilhos dependerem de elementos que mudam por breakpoint.

## Formato do diagnóstico para o usuário

```
| Plataforma | Instalada | Como | Eventos vistos | Dedup | Problemas |
| Meta Pixel | sim | GTM-XXXX | PageView, Lead | não | Lead sem eventID; Pixel duplicado |
| GA4 | sim | gtag inline | page_view | — | eventos vão também ao Ads (sem send_to) |
...
Críticos: …
Recomendações (em ordem): …
```
