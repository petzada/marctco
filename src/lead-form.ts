// Modal do formulário de contato, em duas etapas. Os CTAs das seções são links de WhatsApp
// com `data-lead`: com JavaScript abrem o formulário; sem ele, seguem para o WhatsApp.
import { LEAD_FIELDS, validateLead, type LeadField } from "./lead";

export interface LeadFormHooks {
  /** Chamado ao abrir e ao fechar o modal (o scroll suave para enquanto ele está aberto). */
  onOpen?: () => void;
  onClose?: () => void;
}

type Step = "1" | "2" | "done";

interface Draft {
  step: "1" | "2";
  values: Partial<Record<LeadField, string>>;
  servicos: string[];
}

// Rascunho só neste navegador: quem fecha no meio volta de onde parou
const DRAFT_KEY = "marctco:lead-draft";
const FAILED = "Não foi possível enviar agora. Tente de novo em instantes ou fale com a gente pelo WhatsApp.";

function readDraft(): Draft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
}

function writeDraft(draft: Draft | null): void {
  try {
    if (draft) localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    else localStorage.removeItem(DRAFT_KEY);
  } catch {
    // armazenamento bloqueado (aba anônima, por exemplo): segue sem rascunho
  }
}

export function setupLeadForm({ onOpen, onClose }: LeadFormHooks = {}): void {
  const dialog = document.querySelector<HTMLDialogElement>("#lead-dialog");
  if (!dialog || typeof dialog.showModal !== "function") return;
  const form = dialog.querySelector("form")!;
  const submit = form.querySelector<HTMLButtonElement>("[type=submit]")!;
  const status = form.querySelector<HTMLElement>(".lead__status")!;
  const steps = [...form.querySelectorAll<HTMLElement>(".lead__step")];
  const input = (name: LeadField) => form.elements.namedItem(name) as HTMLInputElement;
  const checks = () => [...form.querySelectorAll<HTMLInputElement>('input[name="servicos"]')];
  let step: Step = "1";
  let origem = "site";
  let trigger: HTMLElement | null = null;

  const values = () => Object.fromEntries(LEAD_FIELDS.map((f) => [f.name, input(f.name).value]));
  const servicos = () => checks().filter((c) => c.checked).map((c) => c.value);

  const saveDraft = () => {
    if (step !== "done") writeDraft({ step, values: values(), servicos: servicos() });
  };

  const show = (next: Step) => {
    step = next;
    for (const el of steps) el.hidden = el.dataset.step !== next;
    const current = steps.find((el) => el.dataset.step === next)!;
    current.querySelector<HTMLElement>("input, button:not([data-close].lead__close)")?.focus();
    saveDraft();
  };

  const showErrors = (errors: Partial<Record<LeadField, string>>, only?: 1 | 2) => {
    for (const field of LEAD_FIELDS.filter((f) => !only || f.step === only)) {
      const message = errors[field.name] ?? "";
      input(field.name).setAttribute("aria-invalid", String(Boolean(message)));
      form.querySelector(`#lead-${field.name}-error`)!.textContent = message;
    }
    const first = LEAD_FIELDS.find((f) => errors[f.name]);
    if (first) {
      if (first.step === 1 && step === "2") show("1");
      input(first.name).focus();
    }
  };

  // Restaura o rascunho salvo
  const draft = readDraft();
  if (draft) {
    for (const field of LEAD_FIELDS) input(field.name).value = draft.values[field.name] ?? "";
    for (const check of checks()) check.checked = draft.servicos.includes(check.value);
  }

  form.addEventListener("input", saveDraft);

  document.addEventListener("click", (event) => {
    const link = (event.target as Element).closest<HTMLAnchorElement>("a[data-lead]");
    if (!link || event.metaKey || event.ctrlKey || event.shiftKey) return;
    event.preventDefault();
    origem = link.dataset.lead ?? "site";
    trigger = link;
    status.textContent = "";
    dialog.showModal();
    onOpen?.();
    show(readDraft()?.step ?? "1");
  });

  form.querySelector("[data-next]")!.addEventListener("click", () => {
    const result = validateLead(values(), 1);
    showErrors(result.ok ? {} : result.errors, 1);
    if (result.ok) show("2");
  });
  form.querySelector("[data-back]")!.addEventListener("click", () => show("1"));
  for (const button of form.querySelectorAll("[data-close]")) button.addEventListener("click", () => dialog.close());

  // Clique no fundo escurecido fecha; Esc já fecha pelo <dialog>. O rascunho fica salvo.
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener("close", () => {
    if (step === "done") show("1");
    onClose?.();
    trigger?.focus();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = { ...values(), servicos: servicos(), site: input("site" as LeadField).value, origem };
    const result = validateLead(payload);
    if (!result.ok) return showErrors(result.errors);
    showErrors({});
    status.textContent = "";
    submit.disabled = true;
    submit.textContent = "Enviando…";
    try {
      const response = await fetch("/api/leads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (response.ok) {
        form.reset();
        writeDraft(null);
        show("done");
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
