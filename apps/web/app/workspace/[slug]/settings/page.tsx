import { getWorkspaceSettings } from "@marctco/db";
import { notFound, redirect } from "next/navigation";
import { canManageSettings } from "../../../../lib/settings-access";
import { resolveWorkspaceAccess } from "../../../../lib/workspace-access";
import { SettingsView } from "./settings-view";

interface SettingsPageProps {
  readonly params: Promise<{ slug: string }>;
  readonly searchParams: Promise<{ error?: string; result?: string }>;
}

export default async function SettingsPage({ params, searchParams }: SettingsPageProps) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const access = await resolveWorkspaceAccess(slug);
  if (access.status === "unauthenticated") redirect("/login");
  if (access.status === "not-found" || !canManageSettings(access.workspace.role)) notFound();

  const settings = await getWorkspaceSettings(access.workspace.context);
  return <SettingsView result={query.result ?? query.error} settings={settings} slug={slug} />;
}
