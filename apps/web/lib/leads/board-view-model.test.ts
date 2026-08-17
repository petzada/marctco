import { describe, expect, it } from "vitest";
import type { LeadBoard } from "@marctco/db";
import { boardEmptyState, buildBoardCardViewModel, flattenBoard } from "./board-view-model";

const board: LeadBoard = {
  pipeline_id: "commercial",
  columns: [
    {
      stage_id: "entry",
      label: "Novo lead",
      position: 1,
      cards: [
        {
          opportunity_id: "b",
          stage_id: "entry",
          name: "Bianca",
          assigned_user_id: "ana",
          assigned_user_name: "Ana Atendente",
          arrived_at: new Date("2026-08-16T10:00:00.000Z")
        }
      ]
    },
    {
      stage_id: "contact",
      label: "Em contato",
      position: 2,
      cards: [
        {
          opportunity_id: "a",
          stage_id: "contact",
          name: null,
          assigned_user_id: null,
          assigned_user_name: null,
          arrived_at: new Date("2026-08-16T09:00:00.000Z")
        }
      ]
    }
  ]
};

describe("buildBoardCardViewModel", () => {
  it("carries name, stage and who is responsible — and nothing monetary", () => {
    const model = buildBoardCardViewModel(board.columns[0]!.cards[0]!, "Novo lead");
    expect(model).toEqual({
      opportunity_id: "b",
      stage_id: "entry",
      name: "Bianca",
      stageLabel: "Novo lead",
      responsibleLabel: "Ana Atendente"
    });
  });

  it("names a lead and a responsible that arrived without one", () => {
    const model = buildBoardCardViewModel(board.columns[1]!.cards[0]!, "Em contato");
    expect(model.name).toBe("Sem nome");
    expect(model.responsibleLabel).toBe("Sem responsável");
  });
});

describe("flattenBoard", () => {
  it("reads the board column by column, so the list scans names in stage order", () => {
    expect(flattenBoard(board).map((card) => [card.name, card.stageLabel])).toEqual([
      ["Bianca", "Novo lead"],
      ["Sem nome", "Em contato"]
    ]);
  });
});

describe("boardEmptyState", () => {
  it("blames the missing tag when a Supervisor has no team, and names who resolves it", () => {
    const copy = boardEmptyState({ isSupervisorWithoutTeam: true });
    expect(copy.description).toContain("tag de equipe");
    expect(copy.description).toContain("Direção");
  });

  it("says the board fills as leads are assigned when the team simply has none yet", () => {
    const copy = boardEmptyState({ isSupervisorWithoutTeam: false });
    expect(copy.description).not.toContain("tag de equipe");
    expect(copy.title).toContain("quadro");
  });
});
