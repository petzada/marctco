import {
  ACESFilmicToneMapping,
  AnimationMixer,
  Color,
  DirectionalLight,
  Fog,
  HalfFloatType,
  HemisphereLight,
  LoopOnce,
  Mesh,
  MeshBasicMaterial,
  type MeshStandardMaterial,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PointLight,
  Scene,
  SphereGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
  type AnimationAction,
  type Material,
} from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { CAMERA_KEYS, CAMERA_KEYS_PORTRAIT, cameraAt, verticalFov, type CameraKey } from "../camera-path";
import { SECTIONS } from "../content";
import { activation, effectProgress, smoothstep } from "../timeline";
import { ACCENT, buildEffects } from "./effects";
import { fetchModel } from "./model";
import { SECTION_SLOT, SLOT_NAMES, buildStreet, glassMaterial, type SlotName } from "./street";

export interface WorldOptions {
  canvas: HTMLCanvasElement;
  /** Celular: sem sombras e bloom em resolução menor. */
  lowPower: boolean;
  /** Chaves de diagnóstico (só com ?perf): desligam sombras, bloom ou a resolução adaptativa. */
  debug?: Partial<Record<"noshadow" | "nobloom" | "noadapt" | "nocompile" | "nodispose", boolean>>;
}

// Resolução adaptativa: degraus do fator sobre o pixel ratio base. Cai um degrau quando a
// mediana do intervalo entre quadros passa de 22 ms (abaixo de ~45 fps) por duas janelas
// seguidas; se o degrau não ajudar (a demora não é de preenchimento), volta e para de tentar.
const SCALE_STEPS = [1, 0.85, 0.7, 0.6] as const;
const ADAPT_WINDOW = 60;
const SLOW_MS = 22;
const FAST_MS = 14;

export class World {
  private readonly renderer: WebGLRenderer;
  private readonly composer: EffectComposer;
  private readonly bloom: UnrealBloomPass;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(50, 1, 0.1, 200);
  private readonly street = buildStreet();
  private readonly effects = buildEffects(this.street);
  private readonly hemi = new HemisphereLight(0xffffff, 0x1a1a1a, 0.6);
  private readonly spot = new PointLight(0xffffff, 0, 12, 1.6);
  private readonly dot = new Mesh(new SphereGeometry(0.14, 16, 12), new MeshBasicMaterial({ color: 0xffffff }));
  private readonly lookAt = new Vector3();
  /** Actions do .glb nomeadas pelo id da seção (gmb, lp, …), tocadas pelo scroll. */
  private readonly actions = new Map<string, AnimationAction>();
  private mixer: AnimationMixer | null = null;
  /** Quadros de câmera: os do desktop ou, com a tela em pé, os do celular. */
  private keys: readonly CameraKey[] = CAMERA_KEYS;
  private readonly basePixelRatio: number;
  private adapt: boolean;
  private readonly debug: NonNullable<WorldOptions["debug"]>;
  private scaleStep = 0;
  private width = 1;
  private height = 1;
  /** Shaders compilados fora da thread principal: até lá nenhum quadro é desenhado. */
  private compiled = false;
  private lastP = Number.NaN;
  private dirty = true;
  private readonly frames: number[] = [];
  private slowWindows = 0;
  private fastWindows = 0;
  /** Mediana da janela anterior a um degrau, para conferir se ele ajudou. */
  private probe: number | null = null;

  /** Renderer, para a medição (perf.ts). */
  get gl(): WebGLRenderer {
    return this.renderer;
  }

  constructor({ canvas, lowPower, debug = {} }: WorldOptions) {
    this.renderer = new WebGLRenderer({ canvas, antialias: !lowPower, powerPreference: "high-performance" });
    this.basePixelRatio = Math.min(window.devicePixelRatio, lowPower ? 1.5 : 2);
    this.adapt = !debug.noadapt;
    this.debug = debug;
    this.renderer.setPixelRatio(this.basePixelRatio);
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = !lowPower && !debug.noshadow;
    this.renderer.shadowMap.type = PCFSoftShadowMap;

    const bg = new Color(0x0a0a0a);
    this.scene.background = bg;
    this.scene.fog = new Fog(bg, 40, 90);

    const moon = new DirectionalLight(0xffffff, 1.5);
    moon.position.set(-12, 24, 14);
    moon.target.position.set(15, 0, 0);
    if (this.renderer.shadowMap.enabled) {
      moon.castShadow = true;
      moon.shadow.mapSize.set(2048, 1024);
      Object.assign(moon.shadow.camera, { left: -28, right: 28, top: 14, bottom: -14, far: 80 });
      moon.shadow.bias = -0.0005;
    }
    this.scene.add(moon, moon.target, this.hemi, this.spot, this.dot);

    this.scene.add(this.street.root);
    for (const e of this.effects) if (e) this.scene.add(e.object);
    if (this.renderer.shadowMap.enabled) {
      this.street.root.traverse((o) => {
        if ((o as Mesh).isMesh) o.castShadow = o.receiveShadow = true;
      });
    }

    this.composer = new EffectComposer(this.renderer);
    this.composer.renderTarget1.texture.type = HalfFloatType;
    this.composer.renderTarget2.texture.type = HalfFloatType;
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    // Limiar alto: só o branco puro (emissivo acima de 1, materiais brancos) brilha.
    this.bloom = new UnrealBloomPass(new Vector2(256, 256), 0.5, 0.3, 0.95);
    this.bloom.enabled = !debug.nobloom;
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    void this.compile();
  }

  /**
   * Compila os shaders em paralelo (KHR_parallel_shader_compile) sem travar a thread
   * principal. Sem isso o primeiro quadro compilava tudo de uma vez, dentro do rAF.
   */
  private async compile(): Promise<void> {
    this.compiled = false;
    // Os efeitos ficam invisíveis até a sua seção: visíveis durante a compilação para
    // os programas deles já existirem quando aparecerem.
    const hidden = this.effects.filter((e) => e && !e.object.visible).map((e) => e!.object);
    for (const o of hidden) o.visible = true;
    try {
      if (!this.debug.nocompile) await this.renderer.compileAsync(this.scene, this.camera);
    } catch {
      // Sem a extensão o three compila na hora; segue para o render normal
    } finally {
      for (const o of hidden) o.visible = false;
      this.compiled = true;
      this.dirty = true;
    }
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.camera.aspect = width / height;
    this.camera.fov = verticalFov(this.camera.aspect);
    // Em pé, o texto ocupa a metade de baixo: o assunto da cena sobe para o terço de cima.
    this.keys = width < height ? CAMERA_KEYS_PORTRAIT : CAMERA_KEYS;
    if (width < height) this.camera.setViewOffset(width, height, 0, height * 0.17, width, height);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
    this.applySize();
    const scale = window.innerWidth < 768 ? 0.35 : 0.5;
    this.bloom.resolution.set(width * scale, height * scale);
    this.dirty = true;
  }

  private applySize(): void {
    this.renderer.setPixelRatio(this.basePixelRatio * SCALE_STEPS[this.scaleStep]!);
    this.renderer.setSize(this.width, this.height, false);
    this.composer.setSize(this.width, this.height);
    this.dirty = true;
  }

  /**
   * Resolução adaptativa: com a mediana do intervalo entre quadros acima de 22 ms por duas
   * janelas de 60 quadros, o render cai um degrau (até 60 % do pixel ratio). Se a janela
   * seguinte não melhorar pelo menos 15 %, o gargalo não é o preenchimento: desfaz e desliga.
   * Estável abaixo de 14 ms por quatro janelas, sobe de volta. Só muda a resolução interna.
   */
  private adaptResolution(frameMs: number): void {
    if (!this.adapt) return;
    this.frames.push(frameMs);
    if (this.frames.length < ADAPT_WINDOW) return;
    const sorted = [...this.frames].sort((a, b) => a - b);
    const p50 = sorted[sorted.length >> 1]!;
    this.frames.length = 0;
    if (this.probe !== null) {
      // Janela logo depois de um degrau: valeu a pena?
      const helped = p50 < this.probe * 0.85;
      this.probe = null;
      if (!helped) {
        this.scaleStep--;
        this.applySize();
        this.adapt = false;
      }
      return;
    }
    if (p50 > SLOW_MS && this.scaleStep < SCALE_STEPS.length - 1) {
      this.fastWindows = 0;
      if (++this.slowWindows >= 2) {
        this.slowWindows = 0;
        this.probe = p50;
        this.scaleStep++;
        this.applySize();
      }
    } else if (p50 < FAST_MS && this.scaleStep > 0) {
      this.slowWindows = 0;
      if (++this.fastWindows >= 4) {
        this.fastWindows = 0;
        this.scaleStep--;
        this.applySize();
      }
    } else {
      this.slowWindows = 0;
      this.fastWindows = 0;
    }
  }

  /**
   * Troca as fachadas provisórias pelo .glb do Blender. `data` pode vir de um fetch
   * começado antes (main.ts), para o download andar em paralelo com o three.js.
   */
  async loadModel(data?: Promise<ArrayBuffer | null>): Promise<boolean> {
    const buffer = await (data ?? fetchModel());
    if (!buffer) return false;
    const [{ GLTFLoader }, { MeshoptDecoder }] = await Promise.all([
      import("three/examples/jsm/loaders/GLTFLoader.js"),
      import("three/examples/jsm/libs/meshopt_decoder.module.js"),
    ]);
    const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(buffer, "");
    const replacements = SLOT_NAMES.flatMap((name) => {
      const replacement = gltf.scene.getObjectByName(name);
      if (!replacement) return [];
      replacement.traverse((o) => {
        const mesh = o as Mesh;
        if (!mesh.isMesh) return;
        mesh.castShadow = mesh.receiveShadow = this.renderer.shadowMap.enabled;
        mesh.material = this.lightableMaterial(name, mesh.material as MeshStandardMaterial);
      });
      // Toldo da padaria: no .glb as listras usam "wall_dark" e "trim"; viram azul e branco
      replacement.getObjectByName("gmb_awning")?.traverse((o) => {
        const mesh = o as Mesh;
        if (!mesh.isMesh) return;
        const name = (mesh.material as MeshStandardMaterial).name;
        mesh.material = this.street.awning[name === "trim" ? 1 : 0];
      });
      return [{ name, replacement }];
    });
    // Compila os materiais novos com as luzes desta cena antes da troca: o quadro seguinte
    // já sai pronto, sem compilar shader dentro do rAF
    if (!this.debug.nocompile) await this.renderer.compileAsync(gltf.scene, this.camera, this.scene).catch(() => undefined);

    const disposed = new Set<Material>();
    for (const { name, replacement } of replacements) {
      const slot = this.street.slots[name];
      // As caixas provisórias saem da GPU junto com a cena
      slot.traverse((o) => {
        const mesh = o as Mesh;
        if (!mesh.isMesh) return;
        if (this.debug.nodispose) return;
        mesh.geometry.dispose();
        const material = mesh.material as Material;
        if (this.isDisposable(name, material) && !disposed.has(material)) {
          disposed.add(material);
          material.dispose();
        }
      });
      slot.clear();
      slot.add(replacement);
    }
    // Os vidros provisórios das janelas ficam só na lista: os do .glb já entraram em lightableMaterial
    if (replacements.some((r) => r.name === "street")) {
      this.street.fillerGlass = this.street.fillerGlass.filter((m) => m.userData.fromModel);
    }
    if (gltf.animations.length) {
      // As Actions apontam para nós pelo nome; depois da troca eles vivem nos grupos da rua.
      this.mixer = new AnimationMixer(this.street.root);
      for (const clip of gltf.animations) {
        // Uma vez só e parada no último quadro: em LoopRepeat, t = 1 voltaria ao início
        const action = this.mixer.clipAction(clip).setLoop(LoopOnce, 1);
        action.clampWhenFinished = true;
        action.play();
        action.paused = true;
        this.actions.set(clip.name, action);
      }
    }
    this.dirty = true;
    return true;
  }

  /** Materiais provisórios que o site não reaproveita (os vidros acesos continuam em uso). */
  private isDisposable(slot: SlotName, material: Material): boolean {
    if (material === this.street.lampGlass || this.street.awning.includes(material as MeshStandardMaterial)) return false;
    if (material === this.street.facades[slot]?.glass) return false;
    return true;
  }

  /**
   * Os vidros do .glb ("glass*") passam a usar os materiais que o site acende: o da
   * fachada, as janelas do bairro (três níveis de brilho) e os postes.
   */
  private lightableMaterial(slot: SlotName, material: MeshStandardMaterial): MeshStandardMaterial {
    const name = material.name;
    if (!name.startsWith("glass")) return material;
    if (name === "glass_lamp") return this.street.lampGlass;
    if (name.startsWith("glass_filler")) {
      const m = glassMaterial();
      m.emissive.copy(ACCENT.windows);
      m.userData.level = [0.6, 1, 1.4][Number(name.at(-1))] ?? 1;
      m.userData.on = true;
      m.userData.fromModel = true;
      this.street.fillerGlass.push(m);
      return m;
    }
    return this.street.facades[slot]?.glass ?? material;
  }

  /**
   * Um quadro da cena no progresso `p`; `time` em segundos. Com `still` (movimento
   * reduzido) cada seção já alcançada mostra o efeito completo, sem tocar.
   * Devolve false quando nada mudou e o quadro anterior foi mantido.
   */
  render(p: number, time: number, intro: number, still = false, frameMs = 0): boolean {
    if (!this.compiled) return false;
    if (frameMs > 0) this.adaptResolution(frameMs);

    const moved = p !== this.lastP;
    this.lastP = p;
    const cam = cameraAt(p, this.keys);
    this.camera.position.set(...cam.position);
    this.lookAt.set(...cam.target);
    this.camera.lookAt(this.lookAt);

    const last = SECTIONS.length - 1;
    const allLit = smoothstep(last - 0.7, last, p);
    // Algum efeito à vista anima com o tempo (órbita, ondas, holograma)? Senão, com `p`
    // parado e a introdução terminada, o quadro anterior continua valendo.
    let animated = intro < 1;

    SECTIONS.forEach((section, i) => {
      const slot = SECTION_SLOT[i];
      const active = activation(p, i);
      const t = still ? (i <= p ? 1 : 0) : effectProgress(p, i);
      const facade = slot ? this.street.facades[slot] : undefined;
      if (facade) {
        // Azul padronizado: acima de 1 o tone mapping clareia o azul e abaixo escurece, então
        // todo vidro de negócio aceso fica em 1,0 e, depois de visto, continua aceso.
        // A vitrine da LP acende pouco por si: quem dá o azul é o fundo da tela (screen).
        const lit = Math.max(active, i <= p ? 1 : 0, allLit);
        const scale = facade.glass.userData.litScale ?? 1;
        const extra = (facade.glass.userData.screen ?? 0) + (facade.glass.userData.billboard ?? 0) * 0.6;
        facade.glass.emissiveIntensity = Math.min(1, lit * scale + extra);
        if (slot === "shop_gmb") {
          // Cinza até a seção começar; azul e branco conforme o toldo abre, e assim fica
          for (const m of this.street.awning) {
            m.color.lerpColors(m.userData.off, m.userData.on, t);
            m.emissiveIntensity = t * m.userData.glow;
          }
        }
        // Negócios acendem azul (ou a cor do efeito: tela da LP, outdoor), inclusive no
        // final, quando o resto do bairro acende em amarelo
        facade.glass.emissive.copy(facade.glass.userData.base ?? ACCENT.business);
      }
      const action = this.actions.get(section.id);
      if (action) action.time = Math.min(t, 0.999) * action.getClip().duration;
      const effect = this.effects[i];
      if (effect) {
        effect.update({ t, active, time, camera: this.camera });
        if (effect.object.visible && !still) animated = true;
      }
    });
    if (moved) this.mixer?.update(0);

    for (const m of this.street.fillerGlass) {
      m.emissiveIntensity = m.userData.on ? allLit * m.userData.level * 1.1 : 0;
    }
    this.street.lampGlass.emissiveIntensity = allLit * 1.8;
    this.hemi.intensity = 0.6 + allLit * 0.6;

    // O ponto de luz pousa na rua no hero e depois acompanha a fachada ativa
    const target = cameraAt(Math.max(p, 1), this.keys).target;
    const start = this.keys[0]!.target[0];
    const groundX = p < 1 ? start + (target[0] - start) * p : target[0];
    const fall = (1 - intro) ** 2 * 14;
    this.dot.position.set(groundX, 0.26 + fall, 0.4);
    this.dot.visible = allLit < 0.95;
    this.spot.position.set(groundX, 2.6 + fall, 1.2);
    this.spot.intensity = 9 * intro * (1 - allLit * 0.6);

    if (!moved && !animated && !this.dirty) return false;
    this.dirty = false;
    this.composer.render();
    return true;
  }
}
