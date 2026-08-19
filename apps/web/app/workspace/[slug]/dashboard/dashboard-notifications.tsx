"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "../../../../components/ui/button";
import { StatusBadge } from "../../../../components/ui/status-badge";
import type { DashboardNotificationViewModel } from "../../../../lib/dashboard/view-model";

interface DashboardNotificationsProps {
  readonly items: readonly DashboardNotificationViewModel[];
  readonly slug: string;
}

export function DashboardNotifications({ items, slug }: DashboardNotificationsProps) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [readIds, setReadIds] = useState<ReadonlySet<string>>(
    () => new Set(items.filter((item) => item.read).map((item) => item.id))
  );
  const [error, setError] = useState<string | null>(null);

  async function markRead(notificationId: string): Promise<void> {
    if (pendingId !== null) {
      return;
    }
    setPendingId(notificationId);
    setError(null);
    try {
      const response = await fetch(
        `/workspace/${slug}/dashboard/notifications/${notificationId}/read`,
        { method: "POST" }
      );
      if (!response.ok) {
        setError("Não foi possível marcar o aviso como lido.");
        return;
      }
      setReadIds((current) => new Set([...current, notificationId]));
      router.refresh();
    } catch {
      setError("Não foi possível marcar o aviso como lido.");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-sm">
      {error ? (
        <p className="text-body-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      <ul className="flex flex-col">
        {items.map((item) => {
          const read = item.read || readIds.has(item.id);
          return (
            <li
              className="flex flex-col gap-sm border-b border-hairline-soft py-md last:border-b-0 md:flex-row md:items-center md:justify-between"
              key={item.id}
            >
              <div className="flex min-w-0 flex-col gap-xxs">
                <Link
                  className={`text-body-strong hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-focus ${read ? "text-ink-muted" : "text-ink"}`}
                  href={item.href}
                >
                  {item.person_name}
                </Link>
                <div className="flex flex-wrap items-center gap-xs">
                  <StatusBadge tone={item.tone}>{item.type_label}</StatusBadge>
                  <StatusBadge tone={read ? "neutral" : "info"}>{read ? "Lida" : "Não lida"}</StatusBadge>
                  <span className="text-caption tabular-nums text-ink-muted">{item.detected_label}</span>
                </div>
              </div>
              {read ? null : (
                <Button
                  disabled={pendingId !== null}
                  onClick={() => {
                    void markRead(item.id);
                  }}
                  type="button"
                  variant="secondary"
                >
                  {pendingId === item.id ? "Marcando…" : "Marcar como lida"}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
