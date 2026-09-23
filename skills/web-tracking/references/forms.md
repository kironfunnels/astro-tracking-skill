# Formulários e checkouts — onde disparar a conversão

O evento de conversão (Lead, CompleteRegistration, Purchase…) deve sair **quando o provedor confirmou**, uma única vez, com os dados que o visitante enviou. Antes de escolher o gatilho, investigue o formulário.

## Checklist de investigação

1. **Quem processa o envio?** Formulário próprio (framework + endpoint), embed nativo de um provedor (renderiza na página e envia por `fetch`), **iframe** de outro domínio, formulário hospedado em outra URL, checkout externo.
2. **O que acontece depois do envio?** Mensagem de sucesso na página, redirecionamento (página de obrigado, grupo de WhatsApp, checkout), abertura de nova aba. Confira no painel do provedor ("após envio", "redirect", "thank you page"): a configuração pública do formulário muitas vezes **não** mostra o redirecionamento, que só aparece na resposta do envio.
3. **Quais campos existem** e como mapeá-los: e-mail → `email`; telefone + DDI → `phone` + `countryCode`; nome → `firstName`/`lastName`; campos de escolha (cargo, interesse) → `data` (ex.: `content_category`), nunca como dado de usuário.
4. **O provedor já envia eventos para o mesmo Pixel/dataset?** Muitas ferramentas de formulário e checkout têm integração própria com Meta/Google. Sem `event_id` comum, o Lead conta em dobro. Decida com o usuário qual lado fica.
5. **Há validação no servidor do provedor?** (telefone inválido, e-mail repetido.) Se houver, o clique/submit não é conversão.

## Gatilhos, do mais confiável ao menos

| Situação | Gatilho | Como |
| --- | --- | --- |
| Embed que envia com `fetch` (com ou sem redirect) | **Resposta do envio** | `captureFormSubmissions({ match, map, isSuccess })` em `src/tracking/form-capture.ts` |
| Formulário próprio com endpoint | Resposta do seu endpoint | `await window.tracking.track('Lead', data, user)` depois do `ok` e antes de redirecionar |
| Redireciona para página de obrigado no seu domínio | Página de obrigado | `track('Lead')` na página, com trava por sessão para não repetir no recarregamento; dados de usuário só se vierem com segurança (nunca por URL) |
| Formulário simples sem validação remota | Submit | `<form data-track-form="Lead">` |
| Iframe de outro domínio | Não observável | Página de obrigado, webhook do provedor → seu backend → APIs, ou integração oficial do provedor |
| Widget com evento próprio (`onSuccess`, `postMessage`) | Callback do provedor | `document.dispatchEvent(new CustomEvent('tracking:event', { detail: { name, data, user } }))` |

## `captureFormSubmissions` em detalhe

Exemplo em Astro (em Next/Nuxt/SvelteKit, chame no mesmo componente do embed dentro de um efeito de cliente; no bundle estático, use `window.trackingForms.capture({...})`):

```astro
<script>
  import { captureFormSubmissions } from '../tracking/form-capture';
  captureFormSubmissions({
    // Só o POST de envio do formulário
    match: /\/api\/forms\/minha-org\/meu-form\//,
    // Padrão: response.ok e sem campo "error". Ajuste ao contrato do provedor.
    isSuccess: (json, response) => response.ok && !json?.error,
    map: (body) => {
      const answers = (body.answers ?? {}) as Record<string, string>;
      return {
        name: 'Lead',
        data: { content_name: 'Nome da oferta' },
        user: { email: answers.email, phone: answers.phone, countryCode: answers.ddi },
      };
    },
  });
</script>
```

- Lê o **corpo que o provedor enviou** (JSON, urlencoded ou FormData) — mais fiel que ler o DOM.
- Espera a resposta; se for sucesso, dispara o evento e **segura a resposta** para o provedor por até `holdMs` (1,5 s) + 300 ms para os beacons saírem. Assim um redirecionamento imediato não corta os eventos.
- Erro do provedor → nenhum evento.
- Instale no mesmo componente do embed. Se o provedor guardar uma referência a `fetch` antes do seu script rodar (raro), carregue o wrapper antes do embed.
- A cópia de servidor sai por `navigator.sendBeacon`: no navegador interno do Instagram, `fetch` com `keepalive` foi perdido no redirect em produção.
- Provedores que usam `XMLHttpRequest` precisam de um wrapper equivalente para `XMLHttpRequest.prototype.send`.
- Para campos `select`, mapeie o valor técnico para o rótulo legível quando isso for útil no relatório.

## Armadilhas reais

- **Lead preso à mensagem de sucesso** com redirect ativo: nenhum Lead por semanas. Sempre pergunte se há redirect.
- **Dois caminhos de detecção** (mensagem + resposta) geram Lead duplo. Escolha um.
- **`MutationObserver` que altera o próprio DOM observado** (placeholder, máscara) entra em laço infinito e trava o `load`. Só escreva quando o valor for diferente.
- **Máscara de telefone** que muda o valor no submit: leia os dados do corpo enviado, não do input.
- **Formulário GET com e-mail** coloca dado pessoal na URL da página seguinte. Troque para POST.
