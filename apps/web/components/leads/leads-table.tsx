"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { LeadAssignmentBatchResult, LeadAssignmentDestination, LeadListRow } from "@marctco/db";
import type { ResolvedWorkspaceSettings } from "@marctco/domain";
import { buildLeadRowViewModel, formatArrivedAt } from "../../lib/leads/row-view-model";
import { supervisorTeamEmptyState } from "../../lib/supervisor-team-empty-state";
import { Card } from "../ui/card";
import { DataTable, DataTableCell, DataTableHeaderCell, DataTableRow } from "../ui/data-table";
import { EmptyState } from "../ui/empty-state";
import { Button } from "../ui/button";
import { Modal } from "../ui/modal";
import { Checkbox } from "../ui/checkbox";
import { LeadRowActions } from "./lead-row-actions";

export interface LeadsTableProps {
  readonly rows: readonly LeadListRow[];
  readonly slug: string;
  readonly hasActiveFilter: boolean;
  readonly isSupervisorWithoutTeam?: boolean;
  readonly actorUserId: string;
  readonly assignDestinations: readonly LeadAssignmentDestination[];
  readonly reassignDestinations: readonly LeadAssignmentDestination[];
  readonly isUnassignedView: boolean;
  readonly clockSettings: ResolvedWorkspaceSettings;
  readonly nowIso: string;
}

/**
 * DESIGN.md "Components > Data Display > data-table" for ≥480px; below that
 * the same rows render as stacked `{component.card}`s (DESIGN.md "Responsive
 * Behavior > Collapsing Strategy"). Both are built from the same
 * `LeadRowViewModel`, so a filter or the marker icon behave identically at
 * every width.
 */
export function LeadsTable({
  ...props
}: LeadsTableProps) {
  const [queryClient] = useState(() => new QueryClient());
  return <QueryClientProvider client={queryClient}><InteractiveLeadsTable {...props} /></QueryClientProvider>;
}

function InteractiveLeadsTable({
  rows,
  slug,
  hasActiveFilter,
  isSupervisorWithoutTeam = false,
  actorUserId,
  assignDestinations,
  reassignDestinations,
  isUnassignedView,
  clockSettings,
  nowIso
}: LeadsTableProps) {
  const router = useRouter();
  const cache = useQueryClient();
  const serverSnapshot = rows.map((row) => `${row.opportunity_id}:${row.assigned_user_id ?? "queue"}`).join(",");
  const queryKey = ["leads", slug, serverSnapshot] as const;
  const { data: visibleRows = rows } = useQuery({ queryKey, queryFn: () => Promise.resolve(rows), initialData: rows, staleTime: Infinity });
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [dialogRows, setDialogRows] = useState<readonly LeadListRow[]>([]);
  const [destinationId, setDestinationId] = useState("");
  const [notices, setNotices] = useState<readonly string[]>([]);
  const mode = dialogRows[0]?.assigned_user_id ? "REASSIGN" : "ASSIGN";
  const destinations = mode === "ASSIGN" ? assignDestinations : reassignDestinations;
  const mutation = useMutation({
    mutationFn: async () => {
      const body = mode === "ASSIGN"
        ? { mode, opportunity_ids: dialogRows.map((row) => row.opportunity_id), user_id: destinationId }
        : { mode, assignments: dialogRows.map((row) => ({ opportunity_id: row.opportunity_id, current_user_id: row.assigned_user_id as string })), user_id: destinationId };
      const response = await fetch(`/workspace/${slug}/leads/assignment`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json() as LeadAssignmentBatchResult & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Não foi possível distribuir os leads");
      return payload;
    },
    onMutate: async () => {
      await cache.cancelQueries({ queryKey });
      const previous = cache.getQueryData<readonly LeadListRow[]>(queryKey) ?? [];
      const destination = destinations.find((item) => item.user_id === destinationId);
      const changingIds = new Set(dialogRows.map((row) => row.opportunity_id));
      cache.setQueryData<readonly LeadListRow[]>(queryKey, mode === "ASSIGN" && isUnassignedView
        ? previous.filter((row) => !changingIds.has(row.opportunity_id))
        : previous.map((row) => changingIds.has(row.opportunity_id)
          ? { ...row, assigned_user_id: destinationId, assigned_user_name: destination?.display_name ?? null }
          : row));
      return { previous, destination };
    },
    onSuccess: (result, _variables, context) => {
      const assignedIds = new Set(result.assigned.map((item) => item.opportunity_id));
      cache.setQueryData<readonly LeadListRow[]>(queryKey, mode === "ASSIGN" && isUnassignedView
        ? context.previous.filter((row) => !assignedIds.has(row.opportunity_id))
        : context.previous.map((row) => assignedIds.has(row.opportunity_id)
          ? { ...row, assigned_user_id: destinationId, assigned_user_name: context.destination?.display_name ?? null }
          : row));
      setNotices(result.refused.map((item) => item.current_assigned_user_name
        ? `${item.current_assigned_user_name} já está com este lead.`
        : "Este lead mudou enquanto você distribuía."));
      setSelected(new Set());
      setDialogRows([]);
      setDestinationId("");
      router.refresh();
    },
    onError: (error, _variables, context) => {
      if (context) cache.setQueryData(queryKey, context.previous);
      setNotices([error instanceof Error ? error.message : "Não foi possível distribuir os leads."]);
    }
  });

  const selectedRows = visibleRows.filter((row) => selected.has(row.opportunity_id));
  const selectedMode = selectedRows[0]?.assigned_user_id ? "REASSIGN" : selectedRows.length ? "ASSIGN" : null;
  function toggle(row: LeadListRow) {
    const rowMode = row.assigned_user_id ? "REASSIGN" : "ASSIGN";
    if (selectedMode && selectedMode !== rowMode) return;
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(row.opportunity_id)) next.delete(row.opportunity_id); else next.add(row.opportunity_id);
      return next;
    });
  }
  const canDistribute = (row: LeadListRow) =>
    (row.assigned_user_id ? reassignDestinations : assignDestinations).length > 0;

  if (visibleRows.length === 0) {
    if (isSupervisorWithoutTeam) {
      const missingTeam = supervisorTeamEmptyState("leads");
      return <EmptyState description={missingTeam.description} title={missingTeam.title} />;
    }
    return (
      <EmptyState
        description={
          hasActiveFilter
            ? "Nenhum lead corresponde a este filtro. Limpe o filtro para ver a lista completa."
            : "Assim que um anúncio ou uma landing page enviar um lead, ele aparece aqui."
        }
        title="Nenhum lead por aqui ainda"
      />
    );
  }

  const models = visibleRows.map((row) => ({
    row,
    opportunity_id: row.opportunity_id,
    model: buildLeadRowViewModel(row, { settings: clockSettings, now: new Date(nowIso) })
  }));

  function openAssignment(rowsToAssign: readonly LeadListRow[]) {
    setDialogRows(rowsToAssign);
    setDestinationId("");
    setNotices([]);
  }

  return (
    <>
      {notices.length ? <div className="mb-sm rounded-md border border-warning bg-warning-surface p-sm text-body-sm text-warning-ink" role="status">{notices.join(" ")}</div> : null}
      {selectedRows.length ? (
        <div className="mb-sm flex flex-wrap items-center justify-between gap-sm rounded-md border border-hairline bg-surface-inset p-sm">
          <p className="text-body-sm text-ink-secondary">{selectedRows.length} lead{selectedRows.length === 1 ? "" : "s"} selecionado{selectedRows.length === 1 ? "" : "s"}</p>
          <Button onClick={() => openAssignment(selectedRows)} variant="primary">{selectedMode === "ASSIGN" ? "Atribuir selecionados" : "Reatribuir selecionados"}</Button>
        </div>
      ) : null}
      <div className="hidden min-[480px]:block">
        <DataTable caption="Leads do workspace">
          <thead>
            <tr>
              <DataTableHeaderCell><span className="sr-only">Selecionar</span></DataTableHeaderCell>
              <DataTableHeaderCell>Nome</DataTableHeaderCell>
              <DataTableHeaderCell>Contatos</DataTableHeaderCell>
              <DataTableHeaderCell>Tipo de financiamento</DataTableHeaderCell>
              <DataTableHeaderCell>Instituição</DataTableHeaderCell>
              <DataTableHeaderCell>Origem</DataTableHeaderCell>
              <DataTableHeaderCell>Campanha</DataTableHeaderCell>
              <DataTableHeaderCell>Formulário</DataTableHeaderCell>
              <DataTableHeaderCell>Chegada</DataTableHeaderCell>
              <DataTableHeaderCell>Espera</DataTableHeaderCell>
              <DataTableHeaderCell>
                <span className="sr-only">Ações</span>
              </DataTableHeaderCell>
            </tr>
          </thead>
          <tbody>
            {models.map(({ row, opportunity_id, model }) => (
              <DataTableRow key={opportunity_id}>
                <DataTableCell>{canDistribute(row) ? <Checkbox aria-label={`Selecionar ${model.name}`} checked={selected.has(opportunity_id)} disabled={Boolean(selectedMode && selectedMode !== (row.assigned_user_id ? "REASSIGN" : "ASSIGN"))} onChange={() => toggle(row)} /> : null}</DataTableCell>
                <DataTableCell strong>
                  <Link
                    className="hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-focus"
                    href={`/workspace/${slug}/leads/${opportunity_id}`}
                  >
                    {model.name}
                  </Link>
                </DataTableCell>
                <DataTableCell>{model.contact}</DataTableCell>
                <DataTableCell>{model.financingTypeLabel}</DataTableCell>
                <DataTableCell>{model.institutionLabel}</DataTableCell>
                <DataTableCell>{model.originLabel}</DataTableCell>
                <DataTableCell>{model.campaignLabel}</DataTableCell>
                <DataTableCell>{model.formLabel}</DataTableCell>
                <DataTableCell numeric>{formatArrivedAt(model.arrivedAt)}</DataTableCell>
                <DataTableCell numeric>{model.waitLabel}</DataTableCell>
                <DataTableCell>
                  <div className="flex items-center gap-xxs"><LeadRowActions markers={model.markers} opportunityId={opportunity_id} slug={slug} />
                    {(row.assigned_user_id ? reassignDestinations : assignDestinations).length ? <Button onClick={() => openAssignment([row])} variant="tertiary">{row.assigned_user_id ? "Reatribuir" : "Atribuir"}</Button> : null}
                  </div>
                </DataTableCell>
              </DataTableRow>
            ))}
          </tbody>
        </DataTable>
      </div>

      <div className="grid gap-sm min-[480px]:hidden">
        {models.map(({ row, opportunity_id, model }) => (
          <Card className="p-md" key={opportunity_id}>
            <div className="flex items-start justify-between gap-sm">
              <div className="flex items-center gap-xs">{canDistribute(row) ? <Checkbox aria-label={`Selecionar ${model.name}`} checked={selected.has(opportunity_id)} disabled={Boolean(selectedMode && selectedMode !== (row.assigned_user_id ? "REASSIGN" : "ASSIGN"))} onChange={() => toggle(row)} /> : null}<Link
                className="text-body-strong text-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-focus"
                href={`/workspace/${slug}/leads/${opportunity_id}`}
              >
                {model.name}
              </Link></div>
              <LeadRowActions markers={model.markers} opportunityId={opportunity_id} slug={slug} />
            </div>
            <dl className="mt-sm grid grid-cols-2 gap-x-sm gap-y-xs text-body-sm">
              <StackedField label="Contatos" value={model.contact} />
              <StackedField label="Financiamento" value={model.financingTypeLabel} />
              <StackedField label="Instituição" value={model.institutionLabel} />
              <StackedField label="Origem" value={model.originLabel} />
              <StackedField label="Campanha" value={model.campaignLabel} />
              <StackedField label="Formulário" value={model.formLabel} />
              <StackedField label="Chegada" numeric value={formatArrivedAt(model.arrivedAt)} />
              <StackedField label="Espera" numeric value={model.waitLabel} />
            </dl>
            {(row.assigned_user_id ? reassignDestinations : assignDestinations).length ? <Button className="mt-sm w-full" onClick={() => openAssignment([row])} variant="secondary">{row.assigned_user_id ? "Reatribuir" : "Atribuir"}</Button> : null}
          </Card>
        ))}
      </div>
      <Modal
        footer={<><Button disabled={mutation.isPending} onClick={() => setDialogRows([])} variant="tertiary">Cancelar</Button><Button disabled={!destinationId || mutation.isPending} onClick={() => mutation.mutate()} variant="primary">{mutation.isPending ? "Distribuindo…" : mode === "ASSIGN" ? "Atribuir" : "Reatribuir"}</Button></>}
        onClose={() => setDialogRows([])}
        open={dialogRows.length > 0}
        title={mode === "ASSIGN" ? "Atribuir leads" : "Reatribuir leads"}
      >
        {mode === "REASSIGN" && dialogRows.some((row) => row.assigned_user_id !== actorUserId) ? (
          <p className="mb-sm rounded-md border border-warning bg-warning-surface p-sm text-body-sm text-warning-ink">Você vai retirar leads de {[...new Set(dialogRows.filter((row) => row.assigned_user_id !== actorUserId).map((row) => row.assigned_user_name ?? "responsável sem nome"))].join(", ")}. Confirme o destino antes de continuar.</p>
        ) : null}
        <label className="grid gap-xxs text-label text-ink-secondary">Novo responsável
          <select className="min-h-11 rounded-md border border-hairline bg-canvas px-sm text-body text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-focus" onChange={(event) => setDestinationId(event.target.value)} value={destinationId}>
            <option value="">Selecione</option>
            {destinations.map((destination) => <option key={destination.user_id} value={destination.user_id}>{destination.display_name}</option>)}
          </select>
        </label>
      </Modal>
    </>
  );
}

function StackedField({
  label,
  value,
  numeric = false
}: Readonly<{ label: string; value: string; numeric?: boolean }>) {
  return (
    <div>
      <dt className="text-caption text-ink-muted">{label}</dt>
      <dd className={`text-ink ${numeric ? "tabular-nums" : ""}`.trim()}>{value}</dd>
    </div>
  );
}
