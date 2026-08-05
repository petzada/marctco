import { notFound, redirect } from "next/navigation";
import { resolveWorkspaceAccess } from "../../../lib/workspace-access";

export default async function WorkspaceLayout({
  children,
  params
}: Readonly<{ children: React.ReactNode; params: Promise<{ slug: string }> }>) {
  const { slug } = await params;
  const access = await resolveWorkspaceAccess(slug);
  if (access.status === "unauthenticated") {
    redirect("/login");
  }
  if (access.status === "not-found") {
    notFound();
  }

  return children;
}
