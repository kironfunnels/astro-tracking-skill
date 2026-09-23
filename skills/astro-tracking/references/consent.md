# Consentimento (LGPD, GDPR) e modos do runtime

Isto não é aconselhamento jurídico. A decisão de base legal e de banner é do cliente e do jurídico dele; a skill implementa a decisão.

## Modos

| `tracking.consent` | Comportamento |
| --- | --- |
| `'none'` | Tudo carrega no primeiro acesso. Comum em sites só para o Brasil que usam legítimo interesse e aviso de privacidade. |
| `'opt-in'` | Google carrega com Consent Mode v2 **negado** (pings sem cookie); Microsoft UET recebe `consent default denied`; Meta, TikTok, Pinterest, LinkedIn e o relay **esperam**. Os eventos da página ficam na fila e saem quando o visitante aceita. A escolha fica em `localStorage` (`trk_consent`). |

API: `window.tracking.consent(true)` ao aceitar, `window.tracking.consent(false)` ao recusar ou revogar (atualiza Google/Microsoft para negado, chama `fbq('consent','revoke')` e `ttq.revokeConsent()`, e para de entregar eventos às demais plataformas).

## Integração com CMP / banner

Chame a API a partir do callback do banner. Exemplo genérico:

```html
<script is:inline>
  function onConsentChange(accepted) {
    (window.trackingQueue ||= []).push((t) => t.consent(accepted));
  }
</script>
```

Se o CMP expõe categorias (analytics × marketing), o runtime trata tudo como uma categoria de marketing. Para separar analytics (GA4) de anúncios, ajuste `grant()` em `client.ts` e os campos do `consentState` em `platforms/google.ts`.

## Brasil (LGPD)

- Informe no aviso de privacidade o uso de pixels e APIs de conversão, o compartilhamento de e-mail/telefone em hash com as plataformas e a finalidade.
- Hash não é anonimização perante a LGPD: continua dado pessoal pseudonimizado.
- Dados sensíveis (saúde, religião, orientação etc.) **não** devem virar parâmetros de evento nem nomes de evento. Em nichos de saúde, a Meta restringe eventos e parâmetros; revise os nomes de evento e `content_name`.

## EEE / Reino Unido (GDPR, DMA)

Consent Mode v2 é obrigatório para usar recursos de anúncios do Google com usuários do EEE. Use `'opt-in'` e um CMP certificado pelo Google quando houver tráfego europeu relevante.

## EUA (Meta LDU)

Para estados com legislação específica, a Meta oferece Limited Data Use: `data_processing_options: ['LDU']` com país/estado. Não vem ligado no template; adicione em `server/meta.ts` e no `fbq('dataProcessingOptions', …)` se o cliente precisar.
