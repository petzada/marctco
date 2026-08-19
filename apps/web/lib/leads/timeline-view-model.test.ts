import { describe, expect, it } from "vitest";
import type { LeadTimelineFact } from "@marctco/db";
import { buildLeadTimelineItemView } from "./timeline-view-model.js";

const UUID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const occurred_at = new Date("2026-08-19T14:00:00.000Z");

function fact(overrides: Partial<LeadTimelineFact>): LeadTimelineFact {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    type: "STAGE_CHANGED",
    occurred_at,
    previous_assigned_user_name: null,
    assigned_user_name: null,
    activity_title: null,
    activity_type: null,
    activity_actor_name: null,
    ingestion_source: null,
    ...overrides
  };
}

describe("buildLeadTimelineItemView", () => {
  it("puts the previous owner by name inside the reassignment caption, never as an id", () => {
    const view = buildLeadTimelineItemView(
      fact({
        type: "REASSIGNED",
        previous_assigned_user_name: "Sofia Supervisora",
        assigned_user_name: "Ana Atendente"
      })
    );
    expect(view.caption).toBe("Reatribuído de Sofia Supervisora para Ana Atendente");
    expect(view.caption).not.toContain(UUID);
    expect(view.occurredAtLabel).toMatch(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/);
  });

  it("keeps each hop's caption after two reassignments, instead of today's owner", () => {
    const first = buildLeadTimelineItemView(
      fact({
        type: "ASSIGNED",
        assigned_user_name: "Sofia Supervisora"
      })
    );
    const second = buildLeadTimelineItemView(
      fact({
        type: "REASSIGNED",
        previous_assigned_user_name: "Sofia Supervisora",
        assigned_user_name: "Ana Atendente"
      })
    );
    const third = buildLeadTimelineItemView(
      fact({
        type: "REASSIGNED",
        previous_assigned_user_name: "Ana Atendente",
        assigned_user_name: "Bruno Colega"
      })
    );
    const afterFurtherChange = buildLeadTimelineItemView(
      fact({
        type: "REASSIGNED",
        previous_assigned_user_name: "Bruno Colega",
        assigned_user_name: "Time ACR"
      })
    );
    expect(first.caption).toBe("Atribuído a Sofia Supervisora");
    expect(second.caption).toBe("Reatribuído de Sofia Supervisora para Ana Atendente");
    expect(third.caption).toBe("Reatribuído de Ana Atendente para Bruno Colega");
    expect(afterFurtherChange.caption).toBe("Reatribuído de Bruno Colega para Time ACR");
  });

  it("names who left the queue return even when a later assignment exists", () => {
    expect(
      buildLeadTimelineItemView(
        fact({
          type: "RETURNED_TO_QUEUE",
          previous_assigned_user_name: "Carlos Desatrelado"
        })
      ).caption
    ).toBe("Devolvido à fila (saída de Carlos Desatrelado)");
    expect(
      buildLeadTimelineItemView(
        fact({
          type: "ASSIGNED",
          assigned_user_name: "Sofia Supervisora"
        })
      ).caption
    ).toBe("Atribuído a Sofia Supervisora");
  });

  it("drops an opaque user id instead of printing it", () => {
    const view = buildLeadTimelineItemView(
      fact({
        type: "REASSIGNED",
        previous_assigned_user_name: UUID,
        assigned_user_name: "Ana Atendente"
      })
    );
    expect(view.caption).toBe("Reatribuído para Ana Atendente");
    expect(view.caption).not.toContain(UUID);
  });

  it("keeps ingestion facts distinct from movement copy", () => {
    expect(
      buildLeadTimelineItemView(
        fact({ type: "RETRANSMISSION_RECEIVED", ingestion_source: "META_LEAD_ADS" })
      ).caption
    ).toBe("Reenvio recebido da origem Meta");
    expect(buildLeadTimelineItemView(fact({ type: "SUBMISSION_REENTERED" })).caption).toBe(
      "Envio reentrou neste lead"
    );
    expect(
      buildLeadTimelineItemView(
        fact({ type: "ACTIVITY_COMPLETED", activity_title: "Ligação sem resposta", activity_type: "CALL" })
      ).caption
    ).toBe("Atividade concluída: Ligação sem resposta");
  });

  it("names channel facts without claiming delivery or a read receipt", () => {
    expect(buildLeadTimelineItemView(fact({ type: "WHATSAPP_OUTBOUND_SENT" })).caption).toBe(
      "Envio aceito pelo canal"
    );
    expect(buildLeadTimelineItemView(fact({ type: "WHATSAPP_OUTBOUND_FAILED" })).caption).toBe(
      "Tentativa automática encerrada sem envio"
    );
    expect(buildLeadTimelineItemView(fact({ type: "WHATSAPP_INBOUND_RECEIVED" })).caption).toBe(
      "Resposta recebida no WhatsApp"
    );
  });
});
