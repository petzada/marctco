"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { LeadActivity } from "@marctco/db";
import { ACTIVITY_TYPES, isActivityOverdue, type ActivityType } from "@marctco/domain";
import { formatArrivedAt } from "../../lib/leads/row-view-model";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { EmptyState } from "../ui/empty-state";
import { FieldError, FieldLabel, TextInput } from "../ui/field";
import { StatusBadge, type StatusBadgeTone } from "../ui/status-badge";

const TYPE_LABELS: Readonly<Record<ActivityType, string>> = {
  CALL: "Ligação",
  MESSAGE: "Mensagem",
  MEETING: "Reunião",
  TASK: "Tarefa"
};

const STATUS_LABELS: Readonly<Record<LeadActivity["status"], string>> = {
  OPEN: "Em aberto",
  DONE: "Concluída",
  CANCELED: "Cancelada"
};

const STATUS_TONE: Readonly<Record<LeadActivity["status"], StatusBadgeTone>> = {
  OPEN: "warning",
  DONE: "success",
  CANCELED: "neutral"
};

const selectClassName =
  "min-h-10 w-full rounded-md border border-hairline bg-canvas px-sm py-xs text-body text-ink hover:border-hairline-strong focus-visible:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-focus pointer-coarse:min-h-11";

function formString(data: FormData, name: string): string {
  const value = data.get(name);
  return typeof value === "string" ? value : "";
}

export interface ActivityAssigneeOption {
  readonly user_id: string;
  readonly display_name: string;
}

export interface LeadCardActivitiesProps {
  readonly slug: string;
  readonly opportunityId: string;
  readonly currentUserId: string;
  readonly activities: readonly LeadActivity[];
  readonly assignees: readonly ActivityAssigneeOption[];
}

export function LeadCardActivities({
  slug,
  opportunityId,
  currentUserId,
  activities,
  assignees
}: LeadCardActivitiesProps) {
  return (
    <section className="grid gap-md">
      <h4 className="text-label text-ink-secondary">Atividades</h4>
      <CreateActivityForm
        assignees={assignees}
        currentUserId={currentUserId}
        opportunityId={opportunityId}
        slug={slug}
      />
      {activities.length === 0 ? (
        <EmptyState
          description="Marque uma ligação, mensagem, reunião ou tarefa para este lead."
          title="Nenhuma atividade neste lead"
        />
      ) : (
        <ol className="grid gap-sm">
          {activities.map((activity) => (
            <ActivityItem activity={activity} key={activity.id} opportunityId={opportunityId} slug={slug} />
          ))}
        </ol>
      )}
    </section>
  );
}

function CreateActivityForm({
  slug,
  opportunityId,
  currentUserId,
  assignees
}: Readonly<{
  slug: string;
  opportunityId: string;
  currentUserId: string;
  assignees: readonly ActivityAssigneeOption[];
}>) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canPickAssignee = assignees.length > 0;

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const type = formString(data, "type");
    const title = formString(data, "title");
    const notes = formString(data, "notes").trim();
    const dueLocal = formString(data, "due_at");
    const assigned = formString(data, "assigned_user_id") || currentUserId;
    if (!dueLocal) {
      setError("Informe data e hora de vencimento.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/workspace/${slug}/leads/${opportunityId}/activities`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type,
          title,
          due_at: new Date(dueLocal).toISOString(),
          assigned_user_id: assigned,
          ...(notes ? { notes } : {})
        })
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(payload.error ?? "Não foi possível salvar a atividade.");
        return;
      }
      form.reset();
      router.refresh();
    } catch {
      setError("Não foi possível salvar a atividade.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="p-md">
      <form className="grid gap-sm" onSubmit={(event) => void handleSubmit(event)}>
        <p className="text-body-sm text-ink">Nova atividade</p>
        <div className="grid gap-sm md:grid-cols-2">
          <div>
            <FieldLabel htmlFor="activity-type" required>
              Tipo
            </FieldLabel>
            <select className={selectClassName} defaultValue="CALL" id="activity-type" name="type">
              {ACTIVITY_TYPES.map((type) => (
                <option key={type} value={type}>
                  {TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <FieldLabel htmlFor="activity-due" required>
              Vencimento
            </FieldLabel>
            <TextInput id="activity-due" name="due_at" required type="datetime-local" />
          </div>
        </div>
        <div>
          <FieldLabel htmlFor="activity-title" required>
            Descrição
          </FieldLabel>
          <TextInput id="activity-title" name="title" required />
        </div>
        <div>
          <FieldLabel htmlFor="activity-notes">Observações</FieldLabel>
          <TextInput id="activity-notes" name="notes" />
        </div>
        {canPickAssignee ? (
          <div>
            <FieldLabel htmlFor="activity-assignee">Responsável</FieldLabel>
            <select className={selectClassName} defaultValue={currentUserId} id="activity-assignee" name="assigned_user_id">
              {assignees.map((member) => (
                <option key={member.user_id} value={member.user_id}>
                  {member.display_name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        {error ? <FieldError>{error}</FieldError> : null}
        <div>
          <Button disabled={submitting} type="submit" variant="primary">
            {submitting ? "Salvando…" : "Marcar atividade"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function ActivityItem({
  activity,
  slug,
  opportunityId
}: Readonly<{ activity: LeadActivity; slug: string; opportunityId: string }>) {
  const overdue = isActivityOverdue({
    status: activity.status,
    due_at: activity.due_at,
    now: new Date()
  });
  return (
    <li
      className={`rounded-lg border p-md ${
        overdue ? "border-danger bg-danger-surface" : "border-hairline bg-canvas"
      }`}
    >
      <div className="flex flex-wrap items-center gap-sm">
        <p className="text-body text-ink">{activity.title}</p>
        <StatusBadge tone={overdue ? "danger" : STATUS_TONE[activity.status]}>
          {overdue ? "Vencida" : STATUS_LABELS[activity.status]}
        </StatusBadge>
        <StatusBadge tone="info">{TYPE_LABELS[activity.type]}</StatusBadge>
      </div>
      <p className="mt-xxs text-body-sm text-ink-muted">
        Vence em <span className="tabular-nums">{formatArrivedAt(activity.due_at)}</span>
        {activity.assigned_user_name ? ` · ${activity.assigned_user_name}` : null}
        {activity.status === "DONE" && activity.completed_at ? (
          <>
            {" "}
            · Concluída em <span className="tabular-nums">{formatArrivedAt(activity.completed_at)}</span>
            {activity.completed_by_user_name ? ` por ${activity.completed_by_user_name}` : null}
          </>
        ) : null}
        {activity.status === "CANCELED" && activity.canceled_at ? (
          <>
            {" "}
            · Cancelada em <span className="tabular-nums">{formatArrivedAt(activity.canceled_at)}</span>
          </>
        ) : null}
      </p>
      {activity.notes ? <p className="mt-xxs text-body-sm text-ink">{activity.notes}</p> : null}
      {activity.status === "OPEN" ? (
        <ActivityActions activity={activity} opportunityId={opportunityId} slug={slug} />
      ) : null}
    </li>
  );
}

function ActivityActions({
  activity,
  slug,
  opportunityId
}: Readonly<{ activity: LeadActivity; slug: string; opportunityId: string }>) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"complete" | "cancel" | "reschedule" | null>(null);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);

  async function post(path: string, body?: unknown): Promise<boolean> {
    setError(null);
    const response = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(payload.error ?? "Não foi possível atualizar a atividade.");
      return false;
    }
    router.refresh();
    return true;
  }

  async function handleComplete(): Promise<void> {
    setBusy("complete");
    try {
      await post(`/workspace/${slug}/leads/${opportunityId}/activities/${activity.id}/complete`);
    } catch {
      setError("Não foi possível concluir a atividade.");
    } finally {
      setBusy(null);
    }
  }

  async function handleCancel(): Promise<void> {
    setBusy("cancel");
    try {
      await post(`/workspace/${slug}/leads/${opportunityId}/activities/${activity.id}/cancel`);
    } catch {
      setError("Não foi possível cancelar a atividade.");
    } finally {
      setBusy(null);
    }
  }

  async function handleReschedule(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const dueLocal = formString(new FormData(event.currentTarget), "due_at");
    if (!dueLocal) {
      setError("Informe a nova data e hora.");
      return;
    }
    setBusy("reschedule");
    try {
      const ok = await post(
        `/workspace/${slug}/leads/${opportunityId}/activities/${activity.id}/reschedule`,
        { due_at: new Date(dueLocal).toISOString() }
      );
      if (ok) setRescheduleOpen(false);
    } catch {
      setError("Não foi possível reagendar a atividade.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-sm grid gap-sm">
      <div className="flex flex-wrap gap-sm">
        <Button disabled={busy !== null} onClick={() => void handleComplete()} type="button" variant="primary">
          Concluir
        </Button>
        <Button
          disabled={busy !== null}
          onClick={() => setRescheduleOpen((open) => !open)}
          type="button"
          variant="secondary"
        >
          Reagendar
        </Button>
        <Button disabled={busy !== null} onClick={() => void handleCancel()} type="button" variant="tertiary">
          Cancelar
        </Button>
      </div>
      {rescheduleOpen ? (
        <form className="flex flex-wrap items-end gap-sm" onSubmit={(event) => void handleReschedule(event)}>
          <div>
            <FieldLabel htmlFor={`reschedule-${activity.id}`}>Nova data e hora</FieldLabel>
            <TextInput id={`reschedule-${activity.id}`} name="due_at" required type="datetime-local" />
          </div>
          <Button disabled={busy !== null} type="submit" variant="secondary">
            Salvar novo vencimento
          </Button>
        </form>
      ) : null}
      {error ? <FieldError>{error}</FieldError> : null}
    </div>
  );
}
