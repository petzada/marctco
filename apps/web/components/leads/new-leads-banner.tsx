"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "../ui/button";

const POLL_INTERVAL_MS = 20_000;

export interface NewLeadsBannerProps {
  readonly slug: string;
  /** The newest row currently on screen — `null` when the list is empty. */
  readonly anchor: { readonly arrived_at: string; readonly id: string } | null;
}

/**
 * "N novos leads — atualizar" by periodic count polling (ADR-0013, ADR-0006
 * regra 8). The list itself never moves on its own — polling only updates
 * this banner's count; `router.refresh()` on click is the one thing that
 * re-renders the table, and only because the gestor asked for it. Supabase
 * Realtime is not an option in this design.
 */
export function NewLeadsBanner({ slug, anchor }: NewLeadsBannerProps) {
  const router = useRouter();
  const [newCount, setNewCount] = useState(0);

  useEffect(() => {
    if (!anchor) {
      return;
    }
    let cancelled = false;

    async function poll(): Promise<void> {
      try {
        const response = await fetch(
          `/workspace/${slug}/leads/new-count?arrived_at=${encodeURIComponent(anchor!.arrived_at)}&id=${anchor!.id}`
        );
        if (!response.ok || cancelled) {
          return;
        }
        const payload = (await response.json()) as { count: number };
        if (!cancelled) {
          setNewCount(payload.count);
        }
      } catch {
        // A failed poll leaves the last known count in place — the banner is
        // an informational nicety, never something the screen depends on.
      }
    }

    const interval = setInterval(() => {
      void poll();
    }, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [slug, anchor]);

  if (!anchor || newCount === 0) {
    return null;
  }

  return (
    <div className="flex items-center justify-between gap-sm rounded-lg border border-hairline bg-primary-subtle px-md py-sm">
      <p className="text-body-sm text-primary">
        {newCount === 1 ? "1 novo lead" : `${newCount} novos leads`}
      </p>
      <Button
        onClick={() => {
          setNewCount(0);
          router.refresh();
        }}
        size="md"
        variant="primary"
      >
        Atualizar
      </Button>
    </div>
  );
}
