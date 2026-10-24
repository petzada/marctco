import "@fontsource-variable/archivo";
import "./styles.css";
import { SECTIONS, whatsappUrl } from "./content";
import { activation, anchorsFor, progressAt, snapProgress } from "./timeline";

const root = document.documentElement;
const chapters = [...document.querySelectorAll<HTMLElement>(".chapter")];
const barCta = document.querySelector<HTMLAnchorElement>("#bar-cta")!;
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

let anchors: number[] = [];
let activeIndex = -1;

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
  root.classList.toggle("past-hero", p > 0.5);
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
  let world: import("./scene/world").World;
  try {
    // A cena carrega depois do texto: a primeira tela já é legível sem three.js.
    const { World } = await import("./scene/world");
    world = new World({ canvas, lowPower });
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
  void world.loadModel().catch((error) => console.warn("bairro.glb não carregou; seguem as fachadas provisórias", error));

  let lenis: import("lenis").default | null = null;
  const setupScroll = async () => {
    lenis?.destroy();
    lenis = null;
    if (reducedMotion.matches) return;
    const { default: Lenis } = await import("lenis");
    lenis = new Lenis({ lerp: 0.085, smoothWheel: true });
  };
  await setupScroll();
  reducedMotion.addEventListener("change", () => void setupScroll());

  const t0 = performance.now();
  const frame = (now: number) => {
    lenis?.raf(now);
    const still = reducedMotion.matches;
    const raw = progressAt(window.scrollY, anchors);
    const p = still ? snapProgress(raw) : raw;
    const seconds = (now - t0) / 1000;
    const intro = still ? 1 : Math.min(1, seconds / 1.8);
    updateOverlay(still ? p : raw);
    world.render(p, still ? 0 : seconds, 1 - (1 - intro) ** 3, still);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

if (root.classList.contains("webgl")) {
  measure();
  updateOverlay(0);
  void start();
}
