# Persistência de parâmetros (UTMs, click IDs e qualquer outro)

Objetivo: o visitante chega com `?utm_source=…&gclid=…&fbclid=…&qualquer=…` e esses valores continuam disponíveis em todas as páginas seguintes, nos checkouts/formulários de outros domínios permitidos e nos campos ocultos dos formulários — mesmo que ele navegue sem os parâmetros na barra de endereço.

## O que o `src/tracking/params.ts` faz

1. **Captura** na entrada: guarda **todos** os parâmetros da URL em `localStorage` (`trk_params`) por 90 dias, como:
   - `first` (primeiro toque, não é sobrescrito até expirar);
   - `last` (último toque: uma **nova chegada de campanha** substitui o conjunto inteiro, para não misturar `utm_*` de campanhas diferentes). Conta como nova chegada a URL com `utm_*` ou click ID, ou com qualquer parâmetro quando o visitante vem de fora do site. Navegação interna com `?page=2` ou `?sort=preco` não apaga a campanha;
   - `clicks` (cada click ID com o horário em que foi visto: `gclid`, `gbraid`, `wbraid`, `dclid`, `fbclid`, `ttclid`, `msclkid`, `li_fat_id`, `epik`, `twclid`, `ScCid`, `rdt_cid`).
2. **Exclui** o que não deve viajar: parâmetros `trk_*` (controle), `_gl` (o gtag cuida), nomes que indicam dado pessoal (`email`, `phone`, `whats`, `cpf`, `nome`, `name`…) e qualquer valor com `@`. Dado pessoal em URL é enviado a todos os pixels e viola as políticas da Meta e do Google.
3. **Decora links** internos (mesmo domínio registrável, inclusive subdomínios) e dos domínios em `tracking.decorateDomains`, acrescentando só os parâmetros que o link ainda não tem (o valor do próprio link vence). Âncoras da mesma página (`#secao`) ficam intactas; links relativos continuam relativos. Roda no carregamento, em mudanças do DOM e no clique (última garantia).
4. **Formulários:** campos ocultos com o nome de um parâmetro recebem o último toque (`<input type="hidden" name="utm_source">`), `first_<nome>` recebe o primeiro toque, e `landing_page`, `first_landing_page`, `referrer` são preenchidos. Formulários **GET** para domínios permitidos ganham os parâmetros como campos.
5. **Embeds:** qualquer elemento com `data-trk-params="src"` (ou lista de atributos, ex. `"src data-url"`) tem esses atributos decorados — útil para iframes de checkout e widgets que recebem a URL por atributo.
6. **API:** `window.tracking.decorateUrl(url)` e `window.tracking.params()` para integrações manuais. Scripts inline que rodam antes do runtime usam a fila: `(window.trackingQueue ||= []).push((t) => …)`.
7. **Relay:** os click IDs vão ao servidor para montar `fbc` (Meta), `ttclid` (TikTok), `click_id`/`epik` (Pinterest) e `msclkid` (Microsoft) mesmo quando o cookie da plataforma não existe.

Para desligar a decoração num trecho: `data-trk-no-params` no link, formulário ou contêiner.

## Casos que exigem atenção

- **Links para outros domínios** só recebem parâmetros se estiverem em `decorateDomains` (ex.: checkout, página do formulário hospedado, app). Links para redes sociais e WhatsApp não devem receber.
- **Redirecionamentos no servidor** (Cloudflare redirect rules, `_redirects`) precisam preservar a query string. Teste com a auditoria.
- **Links montados por JavaScript de terceiros** no momento do clique (ex.: `window.location = …`) não passam pelo decorador; use `window.tracking.decorateUrl()` no código que monta a URL.
- **Formulários de terceiros:** muitos provedores já leem UTMs da URL da página. Se a página interna não tiver mais os parâmetros na URL, o provedor não os vê. Opções: campo oculto com o nome do parâmetro, `data-trk-params` no iframe, ou passar `window.tracking.params().last.params` na API do provedor.
- **Armazenamento bloqueado** (navegação privada restrita): a captura continua valendo para a página atual.
- **Consentimento:** a persistência guarda parâmetros de campanha, não identificadores pessoais; ainda assim, se a política do cliente exigir, só inicie a captura após consentimento (mova `captureParams()` para dentro de `grant()` em `client.ts`).

## Verificar

1. `node <skill>/scripts/audit-site.mjs https://site.com/ --pages 3`: a seção **Persistência de parâmetros** mostra quantos links internos carregam todos os parâmetros de teste e, em `navigation`, se a página seguinte (aberta **sem** parâmetros na URL) continua decorando os links.
2. Manual: abra `https://site.com/?utm_source=teste&utm_campaign=x&gclid=abc&custom=1`, navegue por 2–3 páginas, confira os `href` no DevTools e os campos ocultos antes de enviar o formulário. No `localStorage`, a chave `trk_params` mostra primeiro e último toque.
3. Teste automatizado: `tests/tracking.spec.ts` → "parâmetros da URL seguem para os links internos e para a próxima página".
