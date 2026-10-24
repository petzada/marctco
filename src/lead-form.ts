// Modal do formulário de contato. Os CTAs das seções são links de WhatsApp com
// `data-lead`: com JavaScript abrem o formulário; sem ele, seguem para o WhatsApp.
import { LEAD_FIELDS, validateLead, type LeadField } from "./lead";

export interface LeadFormHooks {
  /** Chamado ao abrir e ao fechar o modal (o scroll suave para enquanto ele está aberto). */
  onOpen?: () => void;
  onClose?: () => void;
}

const SENT = "Recebemos seus dados. Em breve entramos em contato pelo WhatsApp.";
const FAILED = "Não foi possível enviar agora. Tente de novo em instantes ou fale com a gente pelo WhatsApp.";

export function setupLeadForm({ onOpen, onClose }: LeadFormHooks = {}): void {
  const dialog = document.querySelector<HTMLDialogElement>("#lead-dialog");
  const toast = document.querySelector<HTMLElement>("#toast");
  if (!dialog || !toast || typeof dialog.showModal !== "function") return;
  const form = dialog.querySelector("form")!;
  const submit = form.querySelector<HTMLButtonElement>("[type=submit]")!;
  const status = form.querySelector<HTMLElement>(".lead__status")!;
  let origem = "site";
  let trigger: HTMLElement | null = null;
  let toastTimer = 0;

  const showErrors = (errors: Partial<Record<LeadField, string>>) => {
    for (const { name } of LEAD_FIELDS) {
      const input = form.elements.namedItem(name) as HTMLInputElement;
      const message = errors[name] ?? "";
      input.setAttribute("aria-invalid", String(Boolean(message)));
      form.querySelector(`#lead-${name}-error`)!.textContent = message;
    }
    const first = LEAD_FIELDS.find((f) => errors[f.name]);
    if (first) (form.elements.namedItem(first.name) as HTMLInputElement).focus();
  };

  const showToast = (message: string) => {
    toast.textContent = message;
    toast.hidden = false;
    requestAnimationFrame(() => toast.classList.add("toast--in"));
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toast.classList.remove("toast--in");
      window.setTimeout(() => (toast.hidden = true), 300);
    }, 6000);
  };

  document.addEventListener("click", (event) => {
    const link = (event.target as Element).closest<HTMLAnchorElement>("a[data-lead]");
    if (!link || event.metaKey || event.ctrlKey || event.shiftKey) return;
    event.preventDefault();
    origem = link.dataset.lead ?? "site";
    trigger = link;
    status.textContent = "";
    dialog.showModal();
    onOpen?.();
    (form.elements.namedItem(LEAD_FIELDS[0]!.name) as HTMLInputElement).focus();
  });

  dialog.querySelector("[data-close]")!.addEventListener("click", () => dialog.close());
  // Clique no fundo escurecido fecha; Esc já fecha pelo <dialog>
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener("close", () => {
    onClose?.();
    trigger?.focus();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form)) as Record<string, string>;
    const result = validateLead({ ...data, origem });
    if (!result.ok) return showErrors(result.errors);
    showErrors({});
    status.textContent = "";
    submit.disabled = true;
    submit.textContent = "Enviando…";
    try {
      const response = await fetch("/api/leads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...data, origem }),
      });
      if (response.ok) {
        form.reset();
        dialog.close();
        showToast(SENT);
        return;
      }
      const body = (await response.json().catch(() => ({}))) as { errors?: Partial<Record<LeadField, string>> };
      if (response.status === 422 && body.errors) showErrors(body.errors);
      else status.textContent = FAILED;
    } catch {
      status.textContent = FAILED;
    } finally {
      submit.disabled = false;
      submit.textContent = "Enviar";
    }
  });
}
