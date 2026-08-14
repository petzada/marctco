import Link from "next/link";
import type { LeadListRow } from "@marctco/db";
import { buildLeadRowViewModel, formatArrivedAt } from "../../lib/leads/row-view-model";
import { supervisorTeamEmptyState } from "../../lib/supervisor-team-empty-state";
import { Card } from "../ui/card";
import { DataTable, DataTableCell, DataTableHeaderCell, DataTableRow } from "../ui/data-table";
import { EmptyState } from "../ui/empty-state";
import { LeadRowActions } from "./lead-row-actions";

export interface LeadsTableProps {
  readonly rows: readonly LeadListRow[];
  readonly slug: string;
  readonly hasActiveFilter: boolean;
  readonly isSupervisorWithoutTeam?: boolean;
}

/**
 * DESIGN.md "Components > Data Display > data-table" for ≥480px; below that
 * the same rows render as stacked `{component.card}`s (DESIGN.md "Responsive
 * Behavior > Collapsing Strategy"). Both are built from the same
 * `LeadRowViewModel`, so a filter or the marker icon behave identically at
 * every width.
 */
export function LeadsTable({
  rows,
  slug,
  hasActiveFilter,
  isSupervisorWithoutTeam = false
}: LeadsTableProps) {
  if (rows.length === 0) {
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

  const models = rows.map((row) => ({ opportunity_id: row.opportunity_id, model: buildLeadRowViewModel(row) }));

  return (
    <>
      <div className="hidden min-[480px]:block">
        <DataTable caption="Leads do workspace">
          <thead>
            <tr>
              <DataTableHeaderCell>Nome</DataTableHeaderCell>
              <DataTableHeaderCell>Contatos</DataTableHeaderCell>
              <DataTableHeaderCell>Tipo de financiamento</DataTableHeaderCell>
              <DataTableHeaderCell>Instituição</DataTableHeaderCell>
              <DataTableHeaderCell>Origem</DataTableHeaderCell>
              <DataTableHeaderCell>Campanha</DataTableHeaderCell>
              <DataTableHeaderCell>Formulário</DataTableHeaderCell>
              <DataTableHeaderCell>Chegada</DataTableHeaderCell>
              <DataTableHeaderCell>
                <span className="sr-only">Ações</span>
              </DataTableHeaderCell>
            </tr>
          </thead>
          <tbody>
            {models.map(({ opportunity_id, model }) => (
              <DataTableRow key={opportunity_id}>
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
                <DataTableCell>
                  <LeadRowActions markers={model.markers} opportunityId={opportunity_id} slug={slug} />
                </DataTableCell>
              </DataTableRow>
            ))}
          </tbody>
        </DataTable>
      </div>

      <div className="grid gap-sm min-[480px]:hidden">
        {models.map(({ opportunity_id, model }) => (
          <Card className="p-md" key={opportunity_id}>
            <div className="flex items-start justify-between gap-sm">
              <Link
                className="text-body-strong text-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-focus"
                href={`/workspace/${slug}/leads/${opportunity_id}`}
              >
                {model.name}
              </Link>
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
            </dl>
          </Card>
        ))}
      </div>
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
