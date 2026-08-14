import type { TeamMember } from "@marctco/db";
import Link from "next/link";
import { Button } from "../../../../components/ui/button";
import {
  DataTable,
  DataTableCell,
  DataTableHeaderCell,
  DataTableRow
} from "../../../../components/ui/data-table";
import { EmptyState } from "../../../../components/ui/empty-state";
import { FieldLabel, TextInput } from "../../../../components/ui/field";
import { COLLABORATOR_ROLE_OPTIONS } from "../../../../lib/team-access";
import { workspaceRoleLabel } from "../../../../lib/workspace-role";

interface TeamViewProps {
  readonly canManage: boolean;
  readonly editingMember?: TeamMember | undefined;
  readonly members: readonly TeamMember[];
  readonly result?: string | undefined;
  readonly slug: string;
}

const SELECT_CLASSES =
  "min-h-10 w-full rounded-md border border-hairline bg-canvas px-sm py-xs text-body text-ink transition-colors duration-150 ease-out hover:border-hairline-strong focus-visible:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-focus pointer-coarse:min-h-11";

function tagsLabel(tags: readonly string[]): string {
  return tags.length > 0 ? tags.join(", ") : "Sem equipe";
}

function phoneLabel(phone: string | null): string {
  return phone ?? "Não informado";
}

function MemberForm({ member, slug }: Readonly<{ member?: TeamMember | undefined; slug: string }>) {
  const editing = Boolean(member);
  return (
    <section className="rounded-lg border border-hairline bg-canvas p-lg" id="member-form">
      <div className="mb-lg flex flex-wrap items-start justify-between gap-sm">
        <div>
          <h2 className="text-title text-ink">{editing ? "Editar colaborador" : "Novo colaborador"}</h2>
          <p className="mt-xxs text-body-sm text-ink-muted">
            {editing
              ? "Atualize o papel, as equipes ou os dados de contato."
              : "O convite e o vínculo com este workspace nascem juntos."}
          </p>
        </div>
        {editing ? (
          <Link className="text-button text-primary hover:text-primary-hover" href={`/workspace/${slug}/team`}>
            Cancelar
          </Link>
        ) : null}
      </div>

      <form action={`/workspace/${slug}/team`} className="grid gap-md md:grid-cols-2" method="post">
        {member ? <input name="user_id" type="hidden" value={member.user_id} /> : null}
        <div>
          <FieldLabel htmlFor="display_name" required>Nome</FieldLabel>
          <TextInput defaultValue={member?.display_name ?? ""} id="display_name" name="display_name" required />
        </div>
        <div>
          <FieldLabel htmlFor="email" required>E-mail</FieldLabel>
          <TextInput autoComplete="email" className={editing ? "bg-surface-inset" : ""} defaultValue={member?.email ?? ""} id="email" name="email" readOnly={editing} required type="email" />
        </div>
        <div>
          <FieldLabel htmlFor="role" required>Papel</FieldLabel>
          <select className={SELECT_CLASSES} defaultValue={member?.role ?? "ATTENDANT"} id="role" name="role" required>
            {COLLABORATOR_ROLE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>
        <div>
          <FieldLabel htmlFor="whatsapp_phone">WhatsApp</FieldLabel>
          <TextInput autoComplete="tel" defaultValue={member?.whatsapp_phone_e164 ?? ""} id="whatsapp_phone" name="whatsapp_phone" placeholder="+55 11 99999-9999" type="tel" />
        </div>
        <div className="md:col-span-2">
          <FieldLabel htmlFor="tags">Equipes</FieldLabel>
          <TextInput aria-describedby="tags-help" defaultValue={member?.tags.join(", ") ?? ""} id="tags" name="tags" placeholder="Veículos, Imóveis" />
          <p className="mt-1.5 text-caption text-ink-muted" id="tags-help">Separe várias equipes por vírgula. Nomes novos são criados ao salvar.</p>
        </div>
        <div className="md:col-span-2">
          <Button type="submit" variant="primary">{editing ? "Salvar alterações" : "Enviar convite"}</Button>
        </div>
      </form>
    </section>
  );
}

function ResultMessage({ result }: Readonly<{ result?: string | undefined }>) {
  if (!result) return null;
  const failed = result === "failed" || result === "invalid";
  const message = result === "created"
    ? "Colaborador cadastrado."
    : result === "updated"
      ? "Colaborador atualizado."
      : result === "invalid"
        ? "Revise os campos informados."
      : "Não foi possível salvar o colaborador. Tente novamente.";
  return (
    <p className={`rounded-md border px-md py-sm text-body-sm ${failed ? "border-danger text-danger-ink" : "border-hairline bg-surface-inset text-ink"}`} role={failed ? "alert" : "status"}>
      {message}
    </p>
  );
}

export function TeamView({ canManage, editingMember, members, result, slug }: TeamViewProps) {
  return (
    <main className="mx-auto grid max-w-content-wide gap-lg p-md sm:p-lg">
      <header>
        <h1 className="text-headline text-ink">Equipe</h1>
        <p className="mt-xs max-w-prose text-body text-ink-muted">Colaboradores ativos, papéis e equipes deste workspace.</p>
      </header>
      <ResultMessage result={result} />
      {canManage ? <MemberForm member={editingMember} slug={slug} /> : null}

      {members.length === 0 ? (
        <EmptyState title="Nenhum colaborador ativo" description="A Direção pode cadastrar o primeiro colaborador acima." />
      ) : (
        <section aria-labelledby="active-team-title">
          <h2 className="mb-sm text-title text-ink" id="active-team-title">Colaboradores ativos</h2>
          <DataTable caption="Equipe ativa" className="max-[480px]:hidden">
            <thead><tr>
              <DataTableHeaderCell>Nome</DataTableHeaderCell>
              <DataTableHeaderCell>Papel</DataTableHeaderCell>
              <DataTableHeaderCell>Equipes</DataTableHeaderCell>
              <DataTableHeaderCell>WhatsApp</DataTableHeaderCell>
              {canManage ? <DataTableHeaderCell><span className="sr-only">Ações</span></DataTableHeaderCell> : null}
            </tr></thead>
            <tbody>
              {members.map((member) => (
                <DataTableRow key={member.user_id}>
                  <DataTableCell strong><span className="block">{member.display_name ?? "Nome não informado"}</span><span className="block text-caption text-ink-muted">{member.email ?? "E-mail não informado"}</span></DataTableCell>
                  <DataTableCell>{workspaceRoleLabel(member.role)}</DataTableCell>
                  <DataTableCell>{tagsLabel(member.tags)}</DataTableCell>
                  <DataTableCell>{phoneLabel(member.whatsapp_phone_e164)}</DataTableCell>
                  {canManage ? <DataTableCell className="text-right"><Link className="text-button text-primary hover:text-primary-hover" href={`/workspace/${slug}/team?edit=${member.user_id}#member-form`}>Editar</Link></DataTableCell> : null}
                </DataTableRow>
              ))}
            </tbody>
          </DataTable>

          <div className="grid gap-sm min-[481px]:hidden">
            {members.map((member) => (
              <article className="rounded-lg border border-hairline bg-canvas p-md" key={member.user_id}>
                <div className="flex items-start justify-between gap-sm">
                  <div><h3 className="text-body-strong text-ink">{member.display_name ?? "Nome não informado"}</h3><p className="text-caption text-ink-muted">{member.email ?? "E-mail não informado"}</p></div>
                  <span className="rounded-pill bg-surface-inset px-xs py-xxs text-caption text-ink-secondary">{workspaceRoleLabel(member.role)}</span>
                </div>
                <dl className="mt-md grid gap-sm text-body-sm">
                  <div><dt className="text-label text-ink-secondary">Equipes</dt><dd className="mt-xxs text-ink">{tagsLabel(member.tags)}</dd></div>
                  <div><dt className="text-label text-ink-secondary">WhatsApp</dt><dd className="mt-xxs text-ink">{phoneLabel(member.whatsapp_phone_e164)}</dd></div>
                </dl>
                {canManage ? <Link className="mt-md inline-flex min-h-11 items-center text-button text-primary hover:text-primary-hover" href={`/workspace/${slug}/team?edit=${member.user_id}#member-form`}>Editar colaborador</Link> : null}
              </article>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
