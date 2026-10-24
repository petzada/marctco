import "@fontsource/roboto/latin-200.css"; // o latino cobre todos os acentos do português
import "@fontsource/roboto/latin-700.css";
import "@fontsource/roboto/latin-900.css";
import "./styles.css";
import { SECTIONS, whatsappUrl } from "./content";
import { setupLeadForm } from "./lead-form";
import { fetchModel } from "./scene/model";
import { activation, anchorsFor, progressAt, snapProgress } from "./timeline";

const root = document.documentElement;
const chapters = [...document.querySelectorAll<HTMLElement>(".chapter")];
const barCta = document.querySelector<HTMLAnchorElement>("#bar-cta")!;
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

let anchors: number[] = [];
let activeIndex = -1;
let lenis: import("lenis").default | null = null;

function measure(): void {
  anchors = anchorsFor(
    chapters.map((el) => ({ top: el.offsetTop, height: el.offsetHeight })),
    window.innerHeight,
  );
}

/** Texto, logo da barra e CTA acompanham a seção ativa. */
function updateOverlay(p: number): void {
  if (root.classList.contains("no-webgl")) return;
  chapters.forEach((el, i) => el.style.setProperty("--show", activation(p, i).toFixed(3)));
  // Logo do header só na última etapa (bairro aceso e texto colado na borda)
  root.classList.toggle("at-end", p > chapters.length - 1.3);
  const index = Math.round(p);
  if (index !== activeIndex) {
    activeIndex = index;
    const section = SECTIONS[index];
    if (section) barCta.href = whatsappUrl(section.whatsappText);
  }
}

async function start(): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>("#scene")!;
  const lowPower = matchMedia("(pointer: coarse)").matches || window.innerWidth < 768;
  // Medição e chaves de diagnóstico só em desenvolvimento ou com ?perf na URL
  const params = new URLSearchParams(location.search);
  const perfMode = import.meta.env.DEV || params.has("perf");
  const debug = perfMode
    ? Object.fromEntries((["noshadow", "nobloom", "noadapt", "nocompile", "nodispose"] as const).map((k) => [k, params.has(k)]))
    : undefined;
  // O .glb (~95 kB) baixa em paralelo com o chunk do three.js, não depois dele
  const model = fetchModel();
  let world: import("./scene/world").World;
  try {
    // A cena carrega depois do texto: a primeira tela já é legível sem three.js.
    const { World } = await import("./scene/world");
    world = new World({ canvas, lowPower, debug });
    if (import.meta.env.DEV) Object.assign(window, { __world: world }); // inspeção no console
  } catch (error) {
    console.error(error);
    root.classList.replace("webgl", "no-webgl");
    chapters.forEach((el) => el.style.removeProperty("--show"));
    return;
  }

  const resize = () => {
    world.resize(window.innerWidth, window.innerHeight);
    measure();
  };
  resize();
  window.addEventListener("resize", resize);
  void world.loadModel(model).catch((error) => console.warn("bairro.glb não carregou; seguem as fachadas provisórias", error));

  const setupScroll = async () => {
    lenis?.destroy();
    lenis = null;
    if (reducedMotion.matches) return;
    const { default: Lenis } = await import("lenis");
    lenis = new Lenis({ lerp: 0.085, smoothWheel: true });
  };
  await setupScroll();
  reducedMotion.addEventListener("change", () => void setupScroll());

  // Fora do modo de medição o módulo nem é baixado
  const perf = perfMode
    ? await import("./perf").then(({ createPerfMonitor }) => createPerfMonitor(world.gl, SECTIONS.map((s) => s.id)))
    : null;

  const t0 = performance.now();
  let lastNow = 0;
  const frame = (now: number) => {
    perf?.begin();
    const frameMs = lastNow ? now - lastNow : 0;
    lastNow = now;
    lenis?.raf(now);
    const still = reducedMotion.matches;
    const raw = progressAt(window.scrollY, anchors);
    const p = still ? snapProgress(raw) : raw;
    const seconds = (now - t0) / 1000;
    const intro = still ? 1 : Math.min(1, seconds / 1.8);
    updateOverlay(still ? p : raw);
    const rendered = world.render(p, still ? 0 : seconds, 1 - (1 - intro) ** 3, still, frameMs);
    perf?.end(now, p, rendered);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

// O formulário funciona com ou sem WebGL; com o modal aberto o scroll suave para
setupLeadForm({ onOpen: () => lenis?.stop(), onClose: () => lenis?.start() });

if (root.classList.contains("webgl")) {
  measure();
  updateOverlay(0);
  void start();
}
