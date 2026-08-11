"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Marker } from "@marctco/domain";
import { IconButton } from "../ui/button";
import { DropdownMenu } from "../ui/dropdown-menu";
import { markerPresentation } from "../../lib/leads/markers";
import { MarkerIcon, PencilIcon, WarningIcon } from "./icons";
import { LeadQuickEditModal } from "./lead-quick-edit-modal";

export interface LeadRowActionsProps {
  readonly slug: string;
  readonly opportunityId: string;
  readonly markers: readonly Marker[];
}

/**
 * "Um lead, um ícone": every warning on this lead is reached through this
 * one trigger, never a label per marker in the row. Selecting an item opens
 * the card, where the comparison and the resolution live. The separate
 * pencil is the row's own edit action — it never opens the card either
 * (ADR-0007, ADR-0018).
 */
export function LeadRowActions({ slug, opportunityId, markers }: LeadRowActionsProps) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const cardHref = `/workspace/${slug}/leads/${opportunityId}`;

  return (
    <div className="flex items-center gap-xxs">
      {markers.length > 0 ? (
        <DropdownMenu
          badgeCount={markers.length}
          items={markers.map((marker) => {
            const presentation = markerPresentation(marker);
            return {
              key: marker,
              icon: <MarkerIcon icon={presentation.icon} />,
              label: presentation.label,
              onSelect: () => router.push(cardHref)
            };
          })}
          triggerIcon={<WarningIcon />}
          triggerLabel={
            markers.length === 1
              ? `1 aviso neste lead: ${markerPresentation(markers[0] as Marker).label}`
              : `${markers.length} avisos neste lead`
          }
        />
      ) : null}
      <IconButton label="Editar contato do lead" onClick={() => setEditOpen(true)}>
        <PencilIcon />
      </IconButton>
      <LeadQuickEditModal
        onClose={() => setEditOpen(false)}
        open={editOpen}
        opportunityId={opportunityId}
        slug={slug}
      />
    </div>
  );
}
