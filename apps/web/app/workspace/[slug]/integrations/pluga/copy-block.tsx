"use client";

import { useState } from "react";
import { Button } from "../../../../../components/ui/button";

/**
 * A code block with a working copy button — specific to this screen, not a
 * `components/ui/` primitive: the raw-payload viewer and the HTTP Request
 * templates are the only places in this ticket that need "copiável", and
 * DESIGN.md documents no generic clipboard component to build one against.
 */
export function CopyBlock({ code, label }: Readonly<{ code: string; label: string }>) {
  const [copied, setCopied] = useState(false);

  async function handleCopy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch {
      // Clipboard API can be unavailable (insecure context, denied
      // permission); the text stays selectable by hand either way, so this
      // is not surfaced as an error.
    }
  }

  return (
    <div className="mt-md">
      <pre className="overflow-x-auto rounded-lg border border-hairline bg-surface-inset p-md text-mono text-ink">
        <code>{code}</code>
      </pre>
      <Button
        className="mt-xs"
        size="md"
        type="button"
        variant="tertiary"
        onClick={() => {
          void handleCopy();
        }}
      >
        {copied ? "Copiado" : `Copiar ${label}`}
      </Button>
    </div>
  );
}
