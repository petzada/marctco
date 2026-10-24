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
} from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { CAMERA_KEYS, cameraAt, verticalFov } from "../camera-path";
import { SECTIONS } from "../content";
import { activation, effectProgress, smoothstep } from "../timeline";
import { ACCENT, buildEffects } from "./effects";
import { SECTION_SLOT, SLOT_NAMES, buildStreet, glassMaterial, type SlotName } from "./street";

export interface WorldOptions {
  canvas: HTMLCanvasElement;
  /** Celular: sem sombras e bloom em resolução menor. */
  lowPower: boolean;
}

const MODEL_URL = `${import.meta.env.BASE_URL}models/bairro.glb`;

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

  constructor({ canvas, lowPower }: WorldOptions) {
    this.renderer = new WebGLRenderer({ canvas, antialias: !lowPower, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, lowPower ? 1.5 : 2));
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = !lowPower;
    this.renderer.shadowMap.type = PCFSoftShadowMap;

    const bg = new Color(0x0a0a0a);
    this.scene.background = bg;
    this.scene.fog = new Fog(bg, 40, 90);

    const moon = new DirectionalLight(0xffffff, 1.5);
    moon.position.set(-12, 24, 14);
    moon.target.position.set(15, 0, 0);
    if (!lowPower) {
      moon.castShadow = true;
      moon.shadow.mapSize.set(2048, 1024);
      Object.assign(moon.shadow.camera, { left: -28, right: 28, top: 14, bottom: -14, far: 80 });
      moon.shadow.bias = -0.0005;
    }
    this.scene.add(moon, moon.target, this.hemi, this.spot, this.dot);

    this.scene.add(this.street.root);
    for (const e of this.effects) if (e) this.scene.add(e.object);
    if (!lowPower) {
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
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.fov = verticalFov(this.camera.aspect);
    // Em pé, o texto ocupa a metade de baixo: o assunto da cena sobe para o terço de cima.
    if (width < height) this.camera.setViewOffset(width, height, 0, height * 0.17, width, height);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    this.composer.setSize(width, height);
    const scale = window.innerWidth < 768 ? 0.35 : 0.5;
    this.bloom.resolution.set(width * scale, height * scale);
  }

  /** Tenta trocar as fachadas provisórias pelo .glb do Blender; sem arquivo, segue com as caixas. */
  async loadModel(): Promise<boolean> {
    const head = await fetch(MODEL_URL, { method: "HEAD" }).catch(() => null);
    if (!head?.ok || !head.headers.get("content-type")?.includes("model")) return false;
    const [{ GLTFLoader }, { MeshoptDecoder }] = await Promise.all([
      import("three/examples/jsm/loaders/GLTFLoader.js"),
      import("three/examples/jsm/libs/meshopt_decoder.module.js"),
    ]);
    const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(MODEL_URL);
    for (const name of SLOT_NAMES) {
      const replacement = gltf.scene.getObjectByName(name);
      if (!replacement) continue;
      const slot = this.street.slots[name];
      slot.clear();
      if (name === "street") this.street.fillerGlass.length = 0;
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
      slot.add(replacement);
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
      this.street.fillerGlass.push(m);
      return m;
    }
    return this.street.facades[slot]?.glass ?? material;
  }

  /**
   * Um quadro da cena no progresso `p`; `time` em segundos. Com `still` (movimento
   * reduzido) cada seção já alcançada mostra o efeito completo, sem tocar.
   */
  render(p: number, time: number, intro: number, still = false): void {
    const cam = cameraAt(p);
    this.camera.position.set(...cam.position);
    this.lookAt.set(...cam.target);
    this.camera.lookAt(this.lookAt);

    const last = SECTIONS.length - 1;
    const allLit = smoothstep(last - 0.7, last, p);

    SECTIONS.forEach((section, i) => {
      const slot = SECTION_SLOT[i];
      const active = activation(p, i);
      const t = still ? (i <= p ? 1 : 0) : effectProgress(p, i);
      const facade = slot ? this.street.facades[slot] : undefined;
      if (facade) {
        const visited = p > i ? 0.25 : 0;
        // A vitrine da landing page acende pouco: quem brilha são as peças da tela
        const scale = facade.glass.userData.litScale ?? 1;
        const extra = (facade.glass.userData.screen ?? 0) + (facade.glass.userData.billboard ?? 0) * 0.6;
        facade.glass.emissiveIntensity = Math.max(active * 1.5, allLit * 1.3, visited) * scale + extra;
        if (slot === "shop_gmb") for (const m of this.street.awning) m.emissiveIntensity = facade.glass.emissiveIntensity * 0.35;
        // Negócios acendem azul (ou a cor do efeito: tela da LP, outdoor), inclusive no
        // final, quando o resto do bairro acende em amarelo
        facade.glass.emissive.copy(facade.glass.userData.base ?? ACCENT.business);
      }
      const action = this.actions.get(section.id);
      if (action) action.time = Math.min(t, 0.999) * action.getClip().duration;
      this.effects[i]?.update({ t, active, time, camera: this.camera });
    });
    this.mixer?.update(0);

    for (const m of this.street.fillerGlass) {
      m.emissiveIntensity = m.userData.on ? allLit * m.userData.level * 1.1 : 0;
    }
    this.street.lampGlass.emissiveIntensity = allLit * 1.8;
    this.hemi.intensity = 0.6 + allLit * 0.6;

    // O ponto de luz pousa na rua no hero e depois acompanha a fachada ativa
    const target = cameraAt(Math.max(p, 1)).target;
    const groundX = p < 1 ? CAMERA_KEYS[0]!.target[0] + (target[0] - CAMERA_KEYS[0]!.target[0]) * p : target[0];
    const fall = (1 - intro) ** 2 * 14;
    this.dot.position.set(groundX, 0.26 + fall, 0.4);
    this.dot.visible = allLit < 0.95;
    this.spot.position.set(groundX, 2.6 + fall, 1.2);
    this.spot.intensity = 9 * intro * (1 - allLit * 0.6);

    this.composer.render();
  }
}
