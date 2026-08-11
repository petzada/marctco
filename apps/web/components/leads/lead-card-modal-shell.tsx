"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { Modal } from "../ui/modal";

/** `router.back()` closes the intercepted-route modal without losing the list underneath. */
export function LeadCardModalShell({ children }: Readonly<{ children: ReactNode }>) {
  const router = useRouter();
  return (
    <Modal onClose={() => router.back()} open title="Lead">
      {children}
    </Modal>
  );
}
