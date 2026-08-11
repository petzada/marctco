-- Ticket 15 — recuperação da outbox: a fila morta ganha causa e instante, e a
-- expiração do payload ganha a descoberta que lhe faltava. Tudo aditivo.
SET ROLE marctco_migrator;

-- `status = 'FAILED'` já existia no enum desde o ticket 07 e nunca teve
-- escritor: sem uma coluna de causa, marcar o evento como falho contaria menos
-- do que o log. Estas duas colunas são o que a tela de Integrações precisa para
-- responder "o que quebrou neste lead", que é a pergunta que a fila morta
-- existe para responder (ticket 14 deixou a coluna "erro" aberta por isso).
--
-- A causa é texto curto e sem PII por contrato do chamador (`markIntegrationEventFailed`
-- sanea e trunca antes de escrever): o worker erra com o payload cru no escopo,
-- e serializar a mensagem inteira colocaria CPF e telefone numa coluna que a
-- expiração de 90 dias não alcança (ADR-0006 regra 12, ADR-0014).
ALTER TABLE integration_events
  ADD COLUMN failed_at TIMESTAMPTZ(6),
  ADD COLUMN failure_reason TEXT;

-- Um `CASE` em vez de `(a) = (b)`: com `failure_reason` nulo o lado direito de
-- uma igualdade vira NULL e o CHECK passa calado, que é exatamente a linha
-- inconsistente que ele deveria barrar.
ALTER TABLE integration_events
  ADD CONSTRAINT integration_events_failure_is_complete CHECK (
    CASE
      WHEN status = 'FAILED' THEN
        failed_at IS NOT NULL
        AND failure_reason IS NOT NULL
        AND length(btrim(failure_reason)) > 0
        AND length(failure_reason) <= 500
      ELSE failed_at IS NULL AND failure_reason IS NULL
    END
  );

-- A fila morta é uma lista curta lida do mais recente para o mais antigo, com
-- keyset por `(failed_at, id)` (ADR-0013). Parcial porque ela é, por desenho, a
-- minoria das linhas: indexar a tabela inteira para ler as falhas seria pagar
-- em toda ingestão o preço de uma tela que se olha quando algo quebrou.
CREATE INDEX integration_events_workspace_id_failed_at_id_idx
  ON integration_events (workspace_id, failed_at DESC, id DESC)
  WHERE status = 'FAILED';

-- O índice da varredura de expiração. O predicado é a regra do ADR-0014 na
-- forma de índice: evento em quarentena **não** expira enquanto for quarentena,
-- e `raw IS NULL` já significa expirado — nenhum dos dois precisa ser visitado
-- de novo. Assim a varredura de um workspace já limpo custa uma sondagem, e não
-- uma leitura do histórico inteiro dele.
CREATE INDEX integration_events_expiring_payload_idx
  ON integration_events (workspace_id, received_at)
  WHERE raw IS NOT NULL AND status <> 'QUARANTINED';

RESET ROLE;

-- PostgreSQL exige que o dono de entrada tenha CREATE no schema enquanto a
-- posse é transferida; revogado logo abaixo. A guarda deixa o redeploy de uma
-- tentativa falha pular o que já está no lugar (ADR-0010).
DO $schema_grants$
BEGIN
  IF NOT has_schema_privilege('marctco_private_definer', 'private', 'CREATE') THEN
    GRANT CREATE ON SCHEMA private TO marctco_private_definer;
  END IF;
END
$schema_grants$;

SET ROLE marctco_migrator;

-- A quinta função sem tenant, e pela mesma circularidade da segunda: para setar
-- `app.workspace_id` a varredura precisa do `workspace_id` que só a leitura
-- revela, e sem GUC a policy devolve zero linhas (ADR-0006 regra 9, ADR-0019 —
-- emendado por esta migration).
--
-- Ela é a mais estreita das cinco: **não** devolve evento, não devolve `raw`, e
-- não pode devolvê-lo — `marctco_private_definer` tem `SELECT` apenas em
-- `(id, workspace_id, dispatch_status, received_at)`, e uma referência a `raw`
-- aqui falharia por privilégio, não por revisão de código. O que ela responde é
-- "quais tenants têm evento velho o bastante para expirar, e por qual evento
-- começar" — o evento âncora existe para que a varredura possa abrir a
-- transação com um `JobContext` real em vez de um contexto novo sem dono.
--
-- `raw IS NOT NULL` deliberadamente **não** entra no filtro: testá-lo exigiria
-- conceder `SELECT (raw)` a um papel que roda sem tenant nenhum, que é
-- exatamente o que o comentário da `claim_pending_events` recusa. O preço é um
-- `UPDATE` que não encontra nada para um workspace já limpo, e esse `UPDATE`
-- roda sob RLS, servido pelo índice parcial acima.
CREATE FUNCTION private.claim_expired_payload_workspaces(cutoff TIMESTAMPTZ)
RETURNS TABLE(workspace_id UUID, anchor_integration_event_id UUID)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT DISTINCT ON (event.workspace_id) event.workspace_id, event.id
  FROM public.integration_events AS event
  WHERE event.received_at < cutoff
  ORDER BY event.workspace_id, event.received_at, event.id
$function$;

ALTER FUNCTION private.claim_expired_payload_workspaces(TIMESTAMPTZ)
  OWNER TO marctco_private_definer;

REVOKE CREATE ON SCHEMA private FROM marctco_private_definer;

RESET ROLE;

-- Mesma fronteira das outras quatro: o worker não alcança o schema `private`, e
-- a varredura roda no processo que pode chamá-la (ADR-0019).
REVOKE ALL ON FUNCTION private.claim_expired_payload_workspaces(TIMESTAMPTZ)
  FROM PUBLIC, marctco_worker;
GRANT EXECUTE ON FUNCTION private.claim_expired_payload_workspaces(TIMESTAMPTZ)
  TO marctco_app;
