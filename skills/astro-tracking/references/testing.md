# Testes e validação

## Automatizados (Playwright)

`templates/tests/tracking.spec.ts` cobre, sem tocar em nenhuma plataforma real (scripts de fornecedores viram stubs vazios e `/api/events` é interceptado):

- normalização de telefone e as variantes de e-mail por plataforma;
- o relay recusa evento fora do catálogo, domínio de fora e dado de usuário sem hash, e monta uma requisição por plataforma com token;
- `PageView` sai no Pixel e no relay com o mesmo `event_id`;
- `track()` com usuário manda só hashes;
- parâmetros da URL chegam aos links internos e continuam na página seguinte;
- sem `?trk_enable=1`, nada é enviado em localhost.

Rode com `npx playwright test tests/tracking.spec.ts`. Use `TRACKING_TEST_PATH=/rota/` para testar uma página específica. Os testes se adaptam ao `config.ts` (pulam o que não estiver configurado).

Acrescente testes para os gatilhos do projeto:

- formulário de terceiro: sirva um stub do embed com `page.route` que responda como o provedor (sucesso, erro, **redirect**) e confira que o Lead sai uma única vez, com hashes, e só no sucesso;
- botão `data-track`: clique e confira o evento no relay;
- consentimento `opt-in`: nada além do Google antes de `tracking.consent(true)`; depois, fila liberada.

Headless Chrome é ignorado pelo Pixel real da Meta; se algum teste precisar do Pixel real (evite), use `userAgent` sem `HeadlessChrome`.

## Validação manual por plataforma

| Plataforma | Onde | Como |
| --- | --- | --- |
| Meta | Gerenciador de Eventos → Eventos de teste | `?trk_test_meta=TEST…`; cada evento com Navegador + Servidor **Desduplicado**, mesmo ID; conferir chaves de usuário do evento de servidor |
| GA4 | Admin → DebugView / Tempo real | Tag Assistant conectado; nomes e parâmetros corretos; nenhum evento no Ads sem querer |
| Google Ads | Metas → Conversões | Status da ação e diagnóstico de conversões otimizadas (até 72 h) |
| TikTok | Events Manager → Test Events | `?trk_test_tiktok=TEST…` |
| Pinterest | Ads Manager → Conversões → Eventos de teste | `?trk_test_pinterest=1` |
| Microsoft | UET Tag Helper + logs do relay | Eventos com `event_id`; CAPI 200 |
| LinkedIn | Campaign Manager → Rastreamento de conversões | Status "Ativa" após o primeiro evento |
| Relay | `wrangler pages deployment tail` / `wrangler tail` | Nenhum `[relay] … 4xx` |

`?trk_debug=1` escreve cada evento (nome, ID, dados) no console da aba.

## Checklist final

- [ ] `npm run build` e testes de rastreamento passam.
- [ ] Auditoria no deploy novo: disparos esperados, sem duplicados, `eventID` presente, cookies `_fbp`/`_fbc`/`_gcl_aw` criados, parâmetros persistem, sem segredos expostos, sem erros de console.
- [ ] Meta mostra deduplicação para PageView e para a conversão.
- [ ] Uma conversão real controlada (formulário/checkout) passou em todas as plataformas configuradas.
- [ ] Códigos de teste removidos dos secrets (`META_TEST_EVENT_CODE`, `TIKTOK_TEST_EVENT_CODE`).
- [ ] Instalação antiga (GTM, snippets, plugin) removida ou esvaziada dos mesmos pixels.
- [ ] `scan-secrets.mjs` sem achados; `.dev.vars*` no `.gitignore`.
- [ ] README do projeto atualizado (eventos, gatilhos, nomes dos secrets, como testar).
