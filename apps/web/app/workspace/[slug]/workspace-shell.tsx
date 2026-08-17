"use client";

import { ColumnsIcon } from "@phosphor-icons/react/Columns";
import { GearSixIcon } from "@phosphor-icons/react/GearSix";
import { GlobeSimpleIcon } from "@phosphor-icons/react/GlobeSimple";
import { HouseIcon } from "@phosphor-icons/react/House";
import { PlugsConnectedIcon } from "@phosphor-icons/react/PlugsConnected";
import { SignOutIcon } from "@phosphor-icons/react/SignOut";
import { UsersIcon } from "@phosphor-icons/react/Users";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, type ReactNode } from "react";

interface WorkspaceShellProps {
  readonly children: ReactNode;
  readonly slug: string;
  readonly workspaceName: string;
  readonly roleLabel: string;
  readonly canManageIntegrations: boolean;
  readonly canManageSettings: boolean;
  readonly canReadTeam: boolean;
  /**
   * Whether this profile attends leads. The item is absent for Gestão and
   * Direção because their scope on that board is empty, not because the route
   * refuses them — it redirects (ADR-0015).
   */
  readonly attendsLeads: boolean;
  /**
   * Whether this profile has the Leads table. Absent for the ATTENDANT:
   * Meus leads already shows their set. The route redirects, same absence
   * of scope as Gestão on the board (ADR-0015).
   */
  readonly seesLeadsTable: boolean;
}

interface NavigationProps {
  readonly compact?: boolean;
  readonly items: ReadonlyArray<{ href: string; icon: ReactNode; label: string }>;
  readonly onNavigate?: () => void;
  readonly pathname: string;
}

export function WorkspaceShell({
  children,
  slug,
  workspaceName,
  roleLabel,
  canReadTeam,
  canManageIntegrations,
  canManageSettings,
  attendsLeads,
  seesLeadsTable
}: WorkspaceShellProps) {
  const pathname = usePathname();
  const mobileMenu = useRef<HTMLDetailsElement>(null);
  const items = [
    {
      href: `/workspace/${slug}`,
      icon: <HouseIcon aria-hidden="true" size={20} weight="regular" />,
      label: "Visão geral"
    },
    ...(seesLeadsTable
      ? [
          {
            href: `/workspace/${slug}/leads`,
            icon: <UsersIcon aria-hidden="true" size={20} weight="regular" />,
            label: "Leads"
          }
        ]
      : []),
    ...(attendsLeads
      ? [
          {
            href: `/workspace/${slug}/my-leads`,
            icon: <ColumnsIcon aria-hidden="true" size={20} weight="regular" />,
            label: "Meus leads"
          }
        ]
      : []),
    ...(canReadTeam
      ? [
          {
            href: `/workspace/${slug}/team`,
            icon: <UsersIcon aria-hidden="true" size={20} weight="regular" />,
            label: "Equipe"
          }
        ]
      : []),
    ...(canManageIntegrations
      ? [
          {
            href: `/workspace/${slug}/integrations/pluga`,
            icon: <PlugsConnectedIcon aria-hidden="true" size={20} weight="regular" />,
            label: "Pluga"
          },
          {
            href: `/workspace/${slug}/integrations/landing-page`,
            icon: <GlobeSimpleIcon aria-hidden="true" size={20} weight="regular" />,
            label: "Landing page"
          }
        ]
      : []),
    ...(canManageSettings
      ? [
          {
            href: `/workspace/${slug}/settings`,
            icon: <GearSixIcon aria-hidden="true" size={20} weight="regular" />,
            label: "Configurações"
          }
        ]
      : [])
  ];

  return (
    <div className="min-h-[100dvh] bg-canvas">
      <aside className="fixed inset-y-0 left-0 z-10 hidden w-60 flex-col border-r border-hairline bg-canvas-sunken p-sm lg:flex">
        <WorkspaceIdentity name={workspaceName} roleLabel={roleLabel} />
        <Navigation items={items} pathname={pathname} />
        <Logout className="mt-auto" />
      </aside>

      <aside className="fixed inset-y-0 left-0 z-10 hidden w-14 flex-col border-r border-hairline bg-canvas-sunken p-xs md:flex lg:hidden">
        <span aria-hidden="true" className="flex h-11 items-center justify-center text-title text-ink">
          M
        </span>
        <Navigation compact items={items} pathname={pathname} />
        <Logout className="mt-auto" compact />
      </aside>

      <header className="sticky top-0 z-10 border-b border-hairline bg-canvas-sunken md:hidden">
        <details className="group" ref={mobileMenu}>
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between px-md text-label text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-focus">
            <span className="truncate">{workspaceName}</span>
            <span className="text-primary group-open:hidden">Menu</span>
            <span className="hidden text-primary group-open:inline">Fechar</span>
          </summary>
          <div className="fixed bottom-0 left-0 top-14 w-60 border-r border-hairline bg-canvas-sunken p-sm">
            <p className="text-caption text-ink-muted">{roleLabel}</p>
            <Navigation
              items={items}
              onNavigate={() => {
                if (mobileMenu.current) {
                  mobileMenu.current.open = false;
                }
              }}
              pathname={pathname}
            />
            <Logout className="absolute inset-x-sm bottom-sm" />
          </div>
        </details>
      </header>

      <div className="md:pl-14 lg:pl-60">{children}</div>
    </div>
  );
}

function WorkspaceIdentity({ name, roleLabel }: Readonly<{ name: string; roleLabel: string }>) {
  return (
    <div className="px-sm py-md">
      <p className="truncate text-body-strong text-ink">{name}</p>
      <p className="mt-xxs text-caption text-ink-muted">{roleLabel}</p>
    </div>
  );
}

function Navigation({ compact = false, items, onNavigate, pathname }: NavigationProps) {
  return (
    <nav aria-label="Workspace" className="mt-md grid gap-xxs">
      {items.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            aria-label={compact ? item.label : undefined}
            aria-current={active ? "page" : undefined}
            className={
              "flex min-h-11 items-center rounded-md px-sm text-label focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-focus lg:min-h-9 pointer-coarse:lg:min-h-11 " +
              (compact ? "justify-center px-xs " : "") +
              (active
                ? "bg-primary-subtle text-primary"
                : "text-ink-secondary hover:bg-surface-inset hover:text-ink")
            }
            href={item.href}
            key={item.href}
            title={compact ? item.label : undefined}
            {...(onNavigate ? { onClick: onNavigate } : {})}
          >
            {compact ? item.icon : item.label}
            {compact ? <span className="sr-only">{item.label}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}

function Logout({ className, compact = false }: Readonly<{ className: string; compact?: boolean }>) {
  return (
    <form action="/auth/logout" className={className} method="post">
      <button
        aria-label={compact ? "Sair" : undefined}
        className="min-h-11 w-full rounded-md border border-hairline bg-surface-inset px-sm text-button text-ink hover:border-hairline-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-focus active:scale-[0.98]"
        title={compact ? "Sair" : undefined}
        type="submit"
      >
        {compact ? <SignOutIcon aria-hidden="true" size={20} weight="regular" /> : "Sair"}
        {compact ? <span className="sr-only">Sair</span> : null}
      </button>
    </form>
  );
}
