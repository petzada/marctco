"use client";

import type { TeamMember, WorkspaceRole } from "@marctco/db";
import { useState } from "react";
import { Button } from "../../../../components/ui/button";
import { Modal } from "../../../../components/ui/modal";

type MembershipAction = "detach" | "terminate";

export function membershipActionCopy(action: MembershipAction, name: string) {
  return action === "detach"
    ? {
        title: `Desatrelar ${name} deste workspace?`,
        description: "Os leads em aberto voltam à fila deste workspace. A pessoa pode continuar acessando outros workspaces.",
        confirm: "Confirmar desatrelamento"
      }
    : {
        title: `Desligar ${name} dos seus workspaces?`,
        description: "Ela sai dos workspaces em que você é Direção e perde o direito de criar novos. Vínculos de outros responsáveis não são alterados.",
        confirm: "Confirmar desligamento"
      };
}

interface MemberLifecycleActionsProps {
  readonly actorRole: WorkspaceRole;
  readonly member: TeamMember;
}

export function MemberLifecycleActions({ actorRole, member }: MemberLifecycleActionsProps) {
  const [action, setAction] = useState<MembershipAction | null>(null);
  const copy = action
    ? membershipActionCopy(action, member.display_name ?? member.email ?? "este colaborador")
    : null;

  return (
    <div className="flex flex-wrap justify-end gap-xs">
      <Button onClick={() => setAction("detach")} variant="tertiary">Desatrelar</Button>
      {actorRole === "OWNER" ? (
        <Button onClick={() => setAction("terminate")} variant="tertiary">Desligar</Button>
      ) : null}
      <Modal
        footer={action && copy ? (
          <>
            <Button onClick={() => setAction(null)} variant="tertiary">Cancelar</Button>
            <form action="" method="post">
              <input name="membership_action" type="hidden" value={action} />
              <input name="target_user_id" type="hidden" value={member.user_id} />
              <Button type="submit" variant="danger">{copy.confirm}</Button>
            </form>
          </>
        ) : undefined}
        onClose={() => setAction(null)}
        open={action !== null && copy !== null}
        title={copy?.title ?? "Confirmar ação"}
      >
        <p className="text-body text-ink-muted">{copy?.description}</p>
      </Modal>
    </div>
  );
}
