import type { ReactNode } from "react";

/**
 * Declares the `@modal` parallel slot the intercepted route uses so the
 * card can open as an overlay on top of the list (a real Next.js route,
 * server-rendered, still `getLead` and nothing else) while `[opportunityId]`
 * remains a plain, shareable, directly-navigable URL for the same lead.
 */
export default function LeadsLayout({
  children,
  modal
}: Readonly<{ children: ReactNode; modal: ReactNode }>) {
  return (
    <>
      {children}
      {modal}
    </>
  );
}
