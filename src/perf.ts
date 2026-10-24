// Medição de desempenho, só em desenvolvimento ou com `?perf` na URL (main.ts só importa
// este módulo nesses casos, então nada daqui entra no caminho de produção).
//
// Mostra o stats.js, um painel com os percentis do tempo de quadro numa janela de 5 s e o
// `renderer.info` do último quadro, e guarda um histórico por seção para o relatório:
//   __perf.report()  → tabela por seção (p50/p95/p99 do quadro, calls, triângulos)
//   __perf.tour(s)   → rola a página inteira em `s` segundos e imprime o relatório
//   __perf.reset()   → zera o histórico
import type Stats from "stats.js";
import type { WebGLRenderer } from "three";
// O stats.js é UMD: carregado por <script> (asset com hash) em vez de empacotado, para o
// helper de interop CommonJS não cair num chunk que a produção importa.
import statsUrl from "stats.js/build/stats.min.js?url";

async function loadStats(): Promise<Stats> {
  const w = window as Window & { Stats?: new () => Stats };
  if (!w.Stats) {
    await new Promise<void>((resolve, reject) => {
      const script = Object.assign(document.createElement("script"), { src: statsUrl, onload: () => resolve(), onerror: reject });
      document.head.append(script);
    });
  }
  return new w.Stats!();
}

export interface PerfSample {
  /** Intervalo entre dois rAF, em ms (o que o usuário sente como jank). */
  frame: number;
  /** Tempo de CPU na thread principal dentro do quadro (lógica + submissão do render). */
  cpu: number;
}

interface SectionStats {
  frames: number[];
  cpu: number[];
  calls: number;
  triangles: number;
  skipped: number;
}

export interface PerfReportRow {
  section: string;
  frames: number;
  fps: number;
  p50: number;
  p95: number;
  p99: number;
  cpuP95: number;
  calls: number;
  triangles: number;
  skipped: number;
}

export interface PerfMonitor {
  /** Chame no início do rAF. */
  begin(): void;
  /** Chame no fim do rAF com o progresso `p` e se o quadro foi renderizado. */
  end(now: number, p: number, rendered: boolean): void;
}

const WINDOW_MS = 5000;

export function percentile(sorted: readonly number[], q: number): number {
  if (!sorted.length) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
  return sorted[i]!;
}

function summarize(values: readonly number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return { p50: percentile(sorted, 0.5), p95: percentile(sorted, 0.95), p99: percentile(sorted, 0.99) };
}

export async function createPerfMonitor(renderer: WebGLRenderer, sectionIds: readonly string[]): Promise<PerfMonitor> {
  const stats = await loadStats();
  stats.showPanel(0);
  stats.dom.style.cssText += "position:fixed;top:auto;bottom:0;left:0;z-index:99;";
  document.body.append(stats.dom);

  const panel = document.createElement("pre");
  panel.style.cssText =
    "position:fixed;left:0;bottom:48px;z-index:99;margin:0;padding:6px 8px;font:11px/1.35 ui-monospace,monospace;" +
    "color:#fff;background:rgba(0,0,0,.7);pointer-events:none;text-transform:none;white-space:pre";
  document.body.append(panel);

  const recent: { at: number; frame: number }[] = [];
  const perSection = new Map<string, SectionStats>();
  const sectionOf = (p: number) => sectionIds[Math.round(p)] ?? String(Math.round(p));
  const bucket = (id: string) => {
    let b = perSection.get(id);
    if (!b) perSection.set(id, (b = { frames: [], cpu: [], calls: 0, triangles: 0, skipped: 0 }));
    return b;
  };

  // O composer chama render() várias vezes por quadro; com autoReset o info só mostraria o
  // último passe (o quad do OutputPass). Zera uma vez por quadro, aqui.
  renderer.info.autoReset = false;

  let last = 0;
  let cpuStart = 0;
  let lastPaint = 0;

  const report = (): PerfReportRow[] =>
    [...perSection.entries()].map(([section, b]) => {
      const { p50, p95, p99 } = summarize(b.frames);
      const mean = b.frames.reduce((a, x) => a + x, 0) / (b.frames.length || 1);
      return {
        section,
        frames: b.frames.length,
        fps: +(1000 / mean).toFixed(1),
        p50: +p50.toFixed(2),
        p95: +p95.toFixed(2),
        p99: +p99.toFixed(2),
        cpuP95: +summarize(b.cpu).p95.toFixed(2),
        calls: b.calls,
        triangles: b.triangles,
        skipped: b.skipped,
      };
    });

  const tour = (seconds = 21) =>
    new Promise<PerfReportRow[]>((resolve) => {
      perSection.clear();
      const max = document.documentElement.scrollHeight - innerHeight;
      const t0 = performance.now();
      const step = (now: number) => {
        const k = Math.min(1, (now - t0) / (seconds * 1000));
        scrollTo(0, max * k);
        if (k < 1) requestAnimationFrame(step);
        else
          setTimeout(() => {
            const rows = report();
            console.table(rows);
            resolve(rows);
          }, 600);
      };
      requestAnimationFrame(step);
    });

  Object.assign(window, { __perf: { report, tour, reset: () => perSection.clear(), renderer } });

  return {
    begin() {
      renderer.info.reset();
      stats.begin();
      cpuStart = performance.now();
    },
    end(now, p, rendered) {
      stats.end();
      const cpu = performance.now() - cpuStart;
      if (last) {
        const frame = now - last;
        const b = bucket(sectionOf(p));
        b.frames.push(frame);
        b.cpu.push(cpu);
        if (rendered) {
          b.calls = renderer.info.render.calls;
          b.triangles = renderer.info.render.triangles;
        } else b.skipped++;
        recent.push({ at: now, frame });
        while (recent.length && recent[0]!.at < now - WINDOW_MS) recent.shift();
        if (now - lastPaint > 250) {
          lastPaint = now;
          const { p50, p95, p99 } = summarize(recent.map((r) => r.frame));
          const i = renderer.info;
          panel.textContent =
            `seção ${sectionOf(p)}  p=${p.toFixed(2)}${rendered ? "" : "  (parado)"}\n` +
            `quadro 5s  p50 ${p50.toFixed(1)}  p95 ${p95.toFixed(1)}  p99 ${p99.toFixed(1)} ms\n` +
            `calls ${i.render.calls}  tris ${i.render.triangles}  geo ${i.memory.geometries}  tex ${i.memory.textures}  prog ${i.programs?.length ?? 0}\n` +
            `dpr ${renderer.getPixelRatio().toFixed(2)}`;
        }
      }
      last = now;
    },
  };
}
