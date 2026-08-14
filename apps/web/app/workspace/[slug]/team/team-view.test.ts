import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TeamView } from "./team-view";

const members = [
  {
    user_id: "a0000000-0000-4000-8000-000000000001",
    display_name: "Ana Costa",
    email: "ana@hugs.test",
    role: "SUPERVISOR" as const,
    status: "ACTIVE" as const,
    whatsapp_phone_e164: "+5511999999999",
    tags: ["Veiculos", "Imoveis"]
  }
];
const actorUserId = "a0000000-0000-4000-8000-000000000099";

(globalThis as unknown as { React: typeof React }).React = React;

describe("Equipe screen", () => {
  it("offers collaborator roles only and posts tags in the same form", () => {
    const html = renderToStaticMarkup(
      React.createElement(TeamView, {
        actorUserId,
        canManage: true,
        members,
        role: "OWNER",
        slug: "11111111-1111-4111-8111-111111111111"
      })
    );

    expect(html).toContain('value="ATTENDANT"');
    expect(html).toContain('value="SUPERVISOR"');
    expect(html).toContain('value="MANAGER"');
    expect(html).not.toContain('value="OWNER"');
    expect(html).toContain('name="tags"');
    expect(html).toContain("Novo colaborador");
  });

  it("renders a desktop data table and stacked cards below 480px", () => {
    const html = renderToStaticMarkup(
      React.createElement(TeamView, {
        actorUserId,
        canManage: true,
        members,
        role: "OWNER",
        slug: "11111111-1111-4111-8111-111111111111"
      })
    );

    expect(html).toContain("max-[480px]:hidden");
    expect(html).toContain("min-[481px]:hidden");
    expect(html).toContain("Ana Costa");
    expect(html).toContain("Veiculos");
  });

  it("lets Gestao read the roster without rendering management controls", () => {
    const html = renderToStaticMarkup(
      React.createElement(TeamView, {
        actorUserId,
        canManage: false,
        members,
        role: "MANAGER",
        slug: "11111111-1111-4111-8111-111111111111"
      })
    );

    expect(html).toContain("Ana Costa");
    expect(html).not.toContain("Novo colaborador");
    expect(html).not.toContain("Editar colaborador");
  });

  it("explains the missing team tag when a Supervisor has an empty roster", () => {
    const html = renderToStaticMarkup(
      React.createElement(TeamView, {
        actorUserId,
        canManage: false,
        members: [],
        role: "SUPERVISOR",
        slug: "11111111-1111-4111-8111-111111111111"
      })
    );

    expect(html).toContain("Seu time ainda não aparece na Equipe");
    expect(html).toContain("tag de equipe");
    expect(html).toContain("A Direção resolve isso na tela Equipe");
    expect(html).not.toContain("Nenhum colaborador ativo");
  });

  it("preserves the regular empty state for Gestao", () => {
    const html = renderToStaticMarkup(
      React.createElement(TeamView, {
        actorUserId,
        canManage: false,
        members: [],
        role: "MANAGER",
        slug: "11111111-1111-4111-8111-111111111111"
      })
    );

    expect(html).toContain("Nenhum colaborador ativo");
    expect(html).not.toContain("Seu time ainda não aparece na Equipe");
  });

  it("shows tenant detach to Gestao and owner-scoped termination only to Direcao", () => {
    const managerHtml = renderToStaticMarkup(React.createElement(TeamView, {
      actorUserId, canManage: false, members, role: "MANAGER", slug: "11111111-1111-4111-8111-111111111111"
    }));
    const ownerHtml = renderToStaticMarkup(React.createElement(TeamView, {
      actorUserId, canManage: true, members, role: "OWNER", slug: "11111111-1111-4111-8111-111111111111"
    }));
    expect(managerHtml).toContain("Desatrelar");
    expect(managerHtml).not.toContain("Desligar");
    expect(ownerHtml).toContain("Desatrelar");
    expect(ownerHtml).toContain("Desligar");
  });
});
