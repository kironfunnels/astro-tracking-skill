# Diagnóstico em produção e recuperação de conversões

Roteiro usado num caso real: campanha otimizando por Lead mostrava 0 conversões enquanto o provedor do formulário registrava 17 cadastros. Siga na ordem; cada passo elimina uma hipótese.

## 1. "A campanha não mostra conversões"

**a) Campanha aponta para o Pixel e o evento certos?** No Ads Manager (ou pela API/MCP da Meta), nos conjuntos de anúncios: `optimization_goal = OFFSITE_CONVERSIONS` e `promoted_object = { pixel_id, custom_event_type: LEAD }`. Se estiver certo, o problema não é a campanha.

**b) O evento chega ao dataset, e por qual canal?** Estatísticas do dataset por evento, separando navegador (`WEB_ONLY`) de servidor (`SERVER_ONLY`), e por host (mostra quais domínios enviam). Com o MCP da Meta: `ads_get_dataset_stats`. Os horários da API vêm no fuso do Pacífico (`-0700`); converta para o fuso do cliente antes de comparar.

**c) Compare com a fonte da verdade:** contatos do provedor/CRM com as UTMs da campanha, no mesmo intervalo. Se o provedor não mostra a hora do cadastro nem tem API, exporte CSV.

**d) Gerenciador de Eventos → Visão geral → expanda o evento:** contagem processada pelo navegador × servidor e avisos como "Conversões adicionais relatadas da API de Conversões — melhorar desduplicação". No caso real, o Lead chegava pelo Pixel e quase nada pelo servidor.

**e) Espere o atraso normal antes de concluir que está quebrado:** o Ads Manager levou de 15 a 30 minutos para mostrar conversões; estatísticas por hora só consolidam a hora cheia.

## 2. Causas encontradas e correções já incorporadas ao template

| Causa | Sintoma | Correção |
| --- | --- | --- |
| Lead disparado pela mensagem de sucesso, mas o provedor **redireciona** após o envio | Nenhum Lead em lugar nenhum | Capturar pela resposta do envio (`form-capture.ts`) |
| Cópia de servidor enviada com `fetch({ keepalive: true })` e perdida no redirect dentro do **navegador interno do Instagram** | Lead só pelo navegador, servidor quase zero | Relay por `navigator.sendBeacon` (com `fetch` de reserva) e redirect segurado até o envio sair; já é o padrão do `client.ts` |
| Pixel só aceita `em`/`ph` no **primeiro** `fbq('init')` | Lead do navegador sem e-mail/telefone; "correspondência avançada do navegador: nenhum parâmetro" | Nenhuma no navegador (re-init, `set userData` e `setUserData` são ignorados). E-mail e telefone da conversão chegam pela cópia de servidor com o mesmo `event_id`, que por isso é obrigatória. Em visitas seguintes, os hashes salvos entram no primeiro `init` |

## 3. Diagnósticos do Gerenciador de Eventos e como agir

- **"O servidor está enviando um valor fbclid modificado no parâmetro fbc".** A Meta valida o `fbclid`; um valor que ela não emitiu conta como modificado. A causa comum são **testes em produção com fbclid inventado** (`?fbclid=teste123`). Regras: nunca teste com fbclid falso contra o Pixel real — use código de evento de teste e nenhum fbclid, ou o fbclid real de um clique. A auditoria da skill, no modo padrão, bloqueia a entrega justamente por isso. O código nunca altera o fbclid (sem minúsculas, trim ou corte). Valide o formato no Payload Helper da Meta.
- **"Confirme o domínio que pertence a você" com um domínio que você não conhece.** Não confirme. Em Configurações do dataset → **Permissões de tráfego**, crie uma lista de domínios permitidos (allowlist) para bloquear eventos enviados por terceiros ou domínios falsos com o seu ID de Pixel.
- **Host `127.0.0.1` ou `localhost` nas estatísticas.** Algum snippet de terceiro (GTM, pixel inline) rodou em build de teste, Lighthouse ou Playwright. O runtime já não envia nada em localhost; não deixe snippets fora dele no layout.
- **"Envie mais parâmetros (e-mail no PageView)".** Só é possível para quem já converteu (hash salvo e usado no primeiro `init`). Não peça e-mail antes da conversão por causa disso.
- **"Conecte conversas de apps de mensagem".** Irrelevante para landing page de captação.

## 4. O que não é problema (não "corrija")

Campanha com pixel/evento corretos, EMQ alto (ex.: 9,3/10) e evento de servidor aparecendo como **Desduplicado** com o mesmo `event_id` no teste significam que a configuração está certa. Se ainda faltam conversões, a causa é entrega (itens 2 e 3), não configuração.

## 5. Recuperar conversões perdidas (backfill)

A API de Conversões aceita eventos com até **7 dias** de atraso. Use `scripts/backfill-meta.mjs` com o export do provedor:

```bash
node <skill>/scripts/backfill-meta.mjs --file contatos.csv --pixel <PIXEL_ID> --url https://site.com/lp/ \
  --map "email=E-mail,phone=Telefone,created_at=Data de cadastro,fbclid=fbclid,first_name=Nome,utm_source=utm_source,utm_campaign=utm_campaign" \
  --after 2026-09-20T00:00-03:00 --before <momento do deploy da correção> --test-code TEST12345
# revise a simulação; depois --send (token só no ambiente do terminal, ver cabeçalho do script)
```

Regras:

- `action_source` **sempre `website`**. Com `other`, as conversões não contam para campanhas que otimizam evento de site (erro visto num backfill real).
- `--before` = horário do deploy da correção. Contatos depois disso já chegaram ao vivo com outro `event_id`; reenviá-los duplica.
- `event_id` estável por contato (`lead-<hash>`), o que permite rodar de novo sem duplicar.
- `external_id` = hash do e-mail (estável entre eventos do backfill; difere do ID de visitante do runtime, o que é esperado).
- `fbc` reconstruído do `fbclid` guardado pelo provedor: `fb.1.<ms do cadastro>.<fbclid>`. Muitos embeds mandam os click IDs no próprio POST de envio (ex.: `extraParams.fbclid`), então vale conferir se o export inclui a coluna.
- Telefone: no Brasil, decida por comprimento (até 11 dígitos → prefixar 55; o DDD 55 existe). Outros países podem exigir remover o zero de discagem local antes do DDI.
- UTMs vão em `custom_data`, `event_source_url` = landing.
- Faça primeiro com `--test-code` e confira no Gerenciador de Eventos.
