"use client";

import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { AgendaItem, AgendaPipelineOption, AgendaTagOption } from "@marctco/db";
import { ACTIVITY_TYPES, isActivityOverdue, shiftAgendaDate, type ActivityType } from "@marctco/domain";
import { Button } from "../../../../components/ui/button";
import { Card } from "../../../../components/ui/card";
import { EmptyState } from "../../../../components/ui/empty-state";
import { FieldError, FieldLabel, TextInput } from "../../../../components/ui/field";
import { StatusBadge, type StatusBadgeTone } from "../../../../components/ui/status-badge";
import { supervisorTeamEmptyState } from "../../../../lib/supervisor-team-empty-state";
import { agendaHref, type AgendaQuery } from "../../../../lib/agenda/search-params";
import { formatArrivedAt } from "../../../../lib/leads/row-view-model";

const TYPE_LABELS: Readonly<Record<ActivityType, string>> = {
  CALL: "Ligação",
  MESSAGE: "Mensagem",
  MEETING: "Reunião",
  TASK: "Tarefa"
};

const STATUS_TONE: Readonly<Record<AgendaItem["status"], StatusBadgeTone>> = {
  OPEN: "warning",
  DONE: "success",
  CANCELED: "neutral"
};

const selectClassName =
  "min-h-10 w-full rounded-md border border-hairline bg-canvas px-sm py-xs text-body text-ink hover:border-hairline-strong focus-visible:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-focus pointer-coarse:min-h-11";

export interface AgendaLeadOption {
  readonly opportunity_id: string;
  readonly name: string;
}

export interface AgendaMemberOption {
  readonly user_id: string;
  readonly display_name: string;
}

export interface AgendaViewProps {
  readonly slug: string;
  readonly query: AgendaQuery;
  readonly items: readonly AgendaItem[];
  readonly tags: readonly AgendaTagOption[];
  readonly pipelines: readonly AgendaPipelineOption[];
  readonly leads: readonly AgendaLeadOption[];
  readonly members: readonly AgendaMemberOption[];
  readonly currentUserId: string;
  readonly isSupervisorWithoutTeam: boolean;
}

export function AgendaView(props: AgendaViewProps) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={queryClient}>
      <InteractiveAgenda {...props} />
    </QueryClientProvider>
  );
}

function InteractiveAgenda({
  slug,
  query,
  items,
  tags,
  pipelines,
  leads,
  members,
  currentUserId,
  isSupervisorWithoutTeam
}: AgendaViewProps) {
  const router = useRouter();
  const cache = useQueryClient();
  const snapshot = items.map((item) => `${item.id}:${item.status}`).join(",");
  const queryKey = ["agenda", slug, query.view, query.date, snapshot] as const;
  const { data: visibleItems = items } = useQuery({
    queryKey,
    queryFn: () => Promise.resolve(items),
    initialData: items,
    staleTime: Infinity
  });
  const [completeError, setCompleteError] = useState<string | null>(null);
  const complete = useMutation({
    mutationFn: async (item: AgendaItem) => {
      const response = await fetch(
        `/workspace/${slug}/leads/${item.opportunity_id}/activities/${item.id}/complete`,
        { method: "POST" }
      );
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Não foi possível concluir a atividade.");
      }
      return payload;
    },
    onMutate: async (item) => {
      await cache.cancelQueries({ queryKey });
      const previous = cache.getQueryData<readonly AgendaItem[]>(queryKey) ?? visibleItems;
      cache.setQueryData<readonly AgendaItem[]>(
        queryKey,
        previous.map((row) => (row.id === item.id ? { ...row, status: "DONE" } : row))
      );
      setCompleteError(null);
      return { previous };
    },
    onError: (error, _item, context) => {
      if (context?.previous) {
        cache.setQueryData(queryKey, context.previous);
      }
      setCompleteError(error instanceof Error ? error.message : "Não foi possível concluir a atividade.");
    },
    onSettled: () => {
      router.refresh();
    }
  });

  if (isSupervisorWithoutTeam) {
    const copy = supervisorTeamEmptyState("agenda");
    return <EmptyState description={copy.description} title={copy.title} />;
  }

  const days = visibleDays(query, visibleItems);

  return (
    <div className="grid gap-lg">
      {members.length > 0 || tags.length > 0 || pipelines.length > 0 ? (
        <AgendaFilters members={members} pipelines={pipelines} query={query} slug={slug} tags={tags} />
      ) : null}

      <CreateAgendaActivityForm currentUserId={currentUserId} leads={leads} members={members} slug={slug} />

      {completeError ? (
        <p className="rounded-md border border-danger px-md py-sm text-body-sm text-danger-ink" role="alert">
          {completeError}
        </p>
      ) : null}

      {visibleItems.length === 0 ? (
        <EmptyState
          description="Marque uma ligação, mensagem, reunião ou tarefa escolhendo o lead."
          title="Nada marcado neste intervalo"
        />
      ) : (
        <div className="grid grid-cols-1 gap-md lg:grid-cols-7">
          {days.map((day) => (
            <section className="rounded-lg border border-hairline bg-canvas p-md" key={day.key}>
              <h2 className="text-label text-ink-secondary">{day.label}</h2>
              <ol className="mt-sm grid gap-sm">
                {day.items.map((item) => (
                  <AgendaItemCard
                    completing={complete.isPending}
                    item={item}
                    key={item.id}
                    onComplete={() => complete.mutate(item)}
                    slug={slug}
                  />
                ))}
              </ol>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function AgendaFilters({
  slug,
  query,
  members,
  tags,
  pipelines
}: Readonly<{
  slug: string;
  query: AgendaQuery;
  members: readonly AgendaMemberOption[];
  tags: readonly AgendaTagOption[];
  pipelines: readonly AgendaPipelineOption[];
}>) {
  return (
    <form className="flex flex-wrap items-end gap-sm" method="GET">
      <input name="view" type="hidden" value={query.view} />
      <input name="date" type="hidden" value={query.date} />
      {members.length > 0 ? (
        <label className="grid gap-xxs text-label text-ink-secondary">
          Responsável
          <select className={selectClassName} defaultValue={query.responsible_user_id ?? ""} name="responsible">
            <option value="">Todos</option>
            {members.map((member) => (
              <option key={member.user_id} value={member.user_id}>
                {member.display_name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {tags.length > 0 ? (
        <label className="grid gap-xxs text-label text-ink-secondary">
          Equipe
          <select className={selectClassName} defaultValue={query.tag_id ?? ""} name="tag">
            <option value="">Todas</option>
            {tags.map((tag) => (
              <option key={tag.id} value={tag.id}>
                {tag.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {pipelines.length > 0 ? (
        <label className="grid gap-xxs text-label text-ink-secondary">
          Funil
          <select className={selectClassName} defaultValue={query.pipeline_id ?? ""} name="pipeline">
            <option value="">Todos</option>
            {pipelines.map((pipeline) => (
              <option key={pipeline.id} value={pipeline.id}>
                {pipeline.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <Button type="submit" variant="primary">
        Filtrar
      </Button>
      {query.responsible_user_id || query.tag_id || query.pipeline_id ? (
        <a className="text-body-sm text-primary hover:underline" href={agendaHref(slug, query, { responsible_user_id: null, tag_id: null, pipeline_id: null })}>
          Limpar filtros
        </a>
      ) : null}
    </form>
  );
}

function CreateAgendaActivityForm({
  slug,
  leads,
  members,
  currentUserId
}: Readonly<{
  slug: string;
  leads: readonly AgendaLeadOption[];
  members: readonly AgendaMemberOption[];
  currentUserId: string;
}>) {
  const router = useRouter();
  const [leadQuery, setLeadQuery] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const matches = leads.filter((lead) => lead.name.toLowerCase().includes(leadQuery.trim().toLowerCase()));

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const opportunity_id = formString(data, "opportunity_id");
    if (!opportunity_id) {
      setError("Escolha o lead desta atividade.");
      return;
    }
    const dueLocal = formString(data, "due_at");
    if (!dueLocal) {
      setError("Informe data e hora de vencimento.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/workspace/${slug}/agenda/activities`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          opportunity_id,
          type: formString(data, "type"),
          title: formString(data, "title"),
          notes: formString(data, "notes").trim() || null,
          due_at: new Date(dueLocal).toISOString(),
          assigned_user_id: formString(data, "assigned_user_id") || currentUserId
        })
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(payload.error ?? "Não foi possível marcar a atividade.");
        return;
      }
      form.reset();
      setLeadQuery("");
      router.refresh();
    } catch {
      setError("Não foi possível marcar a atividade.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <h2 className="text-title text-ink">Marcar atividade</h2>
      <p className="mt-xxs text-body-sm text-ink-muted">Toda atividade precisa de um lead — não há evento órfão.</p>
      <form className="mt-md grid gap-md md:grid-cols-2" onSubmit={(event) => void handleSubmit(event)}>
        <div className="md:col-span-2">
          <FieldLabel htmlFor="agenda-lead-search" required>
            Lead
          </FieldLabel>
          <TextInput
            id="agenda-lead-search"
            onChange={(event) => setLeadQuery(event.target.value)}
            placeholder="Buscar pelo nome"
            value={leadQuery}
          />
          <select className={`${selectClassName} mt-sm`} id="agenda-lead" name="opportunity_id" required>
            <option value="">Selecione o lead</option>
            {matches.map((lead) => (
              <option key={lead.opportunity_id} value={lead.opportunity_id}>
                {lead.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <FieldLabel htmlFor="agenda-type" required>
            Tipo
          </FieldLabel>
          <select className={selectClassName} defaultValue="CALL" id="agenda-type" name="type">
            {ACTIVITY_TYPES.map((type) => (
              <option key={type} value={type}>
                {TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <FieldLabel htmlFor="agenda-due" required>
            Data e hora
          </FieldLabel>
          <TextInput className="tabular-nums" id="agenda-due" name="due_at" required type="datetime-local" />
        </div>
        <div className="md:col-span-2">
          <FieldLabel htmlFor="agenda-title" required>
            Descrição
          </FieldLabel>
          <TextInput id="agenda-title" name="title" required />
        </div>
        <div className="md:col-span-2">
          <FieldLabel htmlFor="agenda-notes">Notas</FieldLabel>
          <TextInput id="agenda-notes" name="notes" />
        </div>
        {members.length > 0 ? (
          <div>
            <FieldLabel htmlFor="agenda-assignee">Responsável</FieldLabel>
            <select className={selectClassName} defaultValue={currentUserId} id="agenda-assignee" name="assigned_user_id">
              {members.map((member) => (
                <option key={member.user_id} value={member.user_id}>
                  {member.display_name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        {error ? (
          <div className="md:col-span-2">
            <FieldError>{error}</FieldError>
          </div>
        ) : null}
        <div>
          <Button disabled={submitting} type="submit" variant="primary">
            {submitting ? "Salvando…" : "Marcar atividade"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function AgendaItemCard({
  item,
  slug,
  onComplete,
  completing
}: Readonly<{
  item: AgendaItem;
  slug: string;
  onComplete: () => void;
  completing: boolean;
}>) {
  const overdue = isActivityOverdue({ status: item.status, due_at: new Date(item.due_at), now: new Date() });
  return (
    <li
      className={`rounded-lg border p-sm ${
        overdue ? "border-danger bg-danger-surface" : "border-hairline-soft bg-canvas"
      }`}
    >
      <div className="flex flex-wrap items-center gap-xs">
        <p className="text-body-strong text-ink">{item.title}</p>
        <StatusBadge tone={overdue ? "danger" : STATUS_TONE[item.status]}>
          {overdue ? "Vencida" : item.status === "DONE" ? "Concluída" : "Em aberto"}
        </StatusBadge>
        <StatusBadge tone="info">{TYPE_LABELS[item.type]}</StatusBadge>
      </div>
      <p className="mt-xxs text-body-sm text-ink-muted">
        <a className="text-primary hover:underline" href={`/workspace/${slug}/leads/${item.opportunity_id}`}>
          {item.person_name}
        </a>
        {" · "}
        <span className="tabular-nums">{formatArrivedAt(new Date(item.due_at))}</span>
        {item.assigned_user_name ? ` · ${item.assigned_user_name}` : null}
      </p>
      {item.status === "OPEN" ? (
        <div className="mt-sm">
          <Button disabled={completing} onClick={onComplete} type="button" variant="primary">
            Concluir
          </Button>
        </div>
      ) : null}
    </li>
  );
}

function visibleDays(
  query: AgendaQuery,
  items: readonly AgendaItem[]
): ReadonlyArray<{ key: string; label: string; items: AgendaItem[] }> {
  const days: Array<{ key: string; label: string; items: AgendaItem[] }> = [];
  const start = query.view === "week" ? mondayOf(query.date) : query.date;
  const count = query.view === "week" ? 7 : 1;
  const byDay = new Map<string, AgendaItem[]>();
  for (const item of items) {
    const key = civilDate(new Date(item.due_at));
    const bucket = byDay.get(key) ?? [];
    bucket.push(item);
    byDay.set(key, bucket);
  }
  for (let offset = 0; offset < count; offset += 1) {
    const key = shiftAgendaDate(start, offset);
    const [year, month, day] = key.split("-").map(Number);
    const utc = new Date(Date.UTC(year ?? 2026, (month ?? 1) - 1, day ?? 1));
    days.push({
      key,
      label: utc.toLocaleDateString("pt-BR", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" }),
      items: byDay.get(key) ?? []
    });
  }
  return days;
}

function mondayOf(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const utc = new Date(Date.UTC(year ?? 2026, (month ?? 1) - 1, day ?? 1));
  const weekday = utc.getUTCDay();
  const offset = weekday === 0 ? 6 : weekday - 1;
  return shiftAgendaDate(date, -offset);
}

function civilDate(value: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(value);
  const read = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${read("year")}-${read("month")}-${read("day")}`;
}

function formString(data: FormData, name: string): string {
  const value = data.get(name);
  return typeof value === "string" ? value : "";
}
