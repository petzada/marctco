import {
  AdditiveBlending,
  BoxGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
  Shape,
  TorusGeometry,
  Vector3,
  type Camera,
  type MeshStandardMaterial,
  type Object3D,
} from "three";
import { clamp01, smoothstep } from "../timeline";
import type { Street } from "./street";

// Efeito de cada serviço, dirigido pelo progresso local `t` (0 → 1) da sua seção.
// `time` só anima o que se repete (órbita, ondas, holograma); com movimento reduzido
// ele fica parado e cada efeito mostra o quadro final.

export interface FrameState {
  t: number;
  active: number;
  time: number;
  camera: Camera;
}

export interface Effect {
  object: Object3D;
  update(s: FrameState): void;
}

// Cor só nos efeitos: o bairro é cinza e o que a marct.co faz aparece colorido.
// Azul é o negócio local (vidros das fachadas, tela da LP, outdoor, ondas, holograma);
// amarelo quente é o resto do bairro acendendo no final. Valores acima de 1 brilham no bloom.
export const ACCENT = {
  pin: new Color(0xea4335).multiplyScalar(1.15),
  star: new Color(0xfbbc04).multiplyScalar(2.4),
  posts: [0xe1306c, 0x833ab4, 0xf77737, 0xfcaf45, 0x405de6, 0xfd1d1d, 0xc13584].map((c) =>
    new Color(c).multiplyScalar(1.6),
  ),
  // Azul-claro e contido nos vidros dos negócios e no outdoor; a tela da LP um tom acima
  // Mais saturado que o outdoor: com o brilho alto um azul-claro lava para branco
  business: new Color(0x3f8cff),
  billboard: new Color(0x9fcfff),
  lpScreen: new Color(0x5aa8ff),
  wave: new Color(0x2f7bff).multiplyScalar(2),
  holoWire: new Color(0x5fb4ff).multiplyScalar(2),
  holoFill: new Color(0x7a86ff),
  windows: new Color(0xffc46b),
} as const;

const tinted = (color: Color) => new MeshBasicMaterial({ color });

const white = (opacity = 1) =>
  new MeshBasicMaterial({ color: 0xffffff, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 });

const glow = (opacity: number, color: Color | number = 0xffffff) =>
  new MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending: AdditiveBlending,
    depthWrite: false,
    side: DoubleSide,
  });

const easeOut = (t: number) => 1 - (1 - t) ** 3;

function starGeometry(r: number): ExtrudeGeometry {
  const shape = new Shape();
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    if (i === 0) shape.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    else shape.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  return new ExtrudeGeometry(shape, { depth: 0.05, bevelEnabled: false });
}

/** Google Meu Negócio: o pin do Maps sobe do telhado e as estrelas acendem uma a uma. */
function mapsPin(at: Street["anchors"]["gmbRoof"]): Effect {
  const root = new Group();
  const pin = new Group();
  const mat = tinted(ACCENT.pin);
  const head = new Mesh(new IcosahedronGeometry(0.42, 1), mat);
  head.position.y = 0.95;
  const tip = new Mesh(new ConeGeometry(0.38, 0.95, 8), mat);
  tip.rotation.x = Math.PI;
  tip.position.y = 0.45;
  const hole = new Mesh(new CylinderGeometry(0.16, 0.16, 0.9, 12), new MeshBasicMaterial({ color: 0x111111 }));
  hole.rotation.x = Math.PI / 2;
  hole.position.y = 0.97;
  pin.add(head, tip, hole);
  root.add(pin);

  const starGeo = starGeometry(0.17);
  const stars = Array.from({ length: 5 }, (_, i) => {
    const s = new Mesh(starGeo, tinted(ACCENT.star));
    s.position.set((i - 2) * 0.42, 2.05 - Math.abs(i - 2) * 0.08, 0);
    root.add(s);
    return s;
  });

  root.position.set(...at);
  return {
    object: root,
    update({ t, time }) {
      const rise = easeOut(smoothstep(0, 0.55, t));
      root.visible = t > 0;
      pin.position.y = -1.4 + rise * 1.4 + Math.sin(time * 1.6) * 0.06 * rise;
      pin.scale.setScalar(0.3 + 0.7 * rise);
      pin.rotation.y = time * 0.5;
      stars.forEach((s, i) => {
        const k = easeOut(smoothstep(0.45 + i * 0.1, 0.6 + i * 0.1, t));
        s.scale.setScalar(k);
        s.rotation.y = (1 - k) * Math.PI;
      });
    },
  };
}

/** Landing page: a vitrine vira uma tela que se monta peça por peça. */
function screenBuild(at: Street["anchors"]["lpWindow"], glass: MeshStandardMaterial): Effect {
  const root = new Group();
  const { w, h } = at;
  // Blocos escuros sobre a tela azul; título e botão em branco
  const soft = new MeshBasicMaterial({ color: 0x2b2b2b });
  const strong = white();
  // [x, y, largura, altura, material] em fração da vitrine, a partir do canto superior esquerdo
  const pieces: [number, number, number, number, MeshBasicMaterial][] = [
    [0.04, 0.05, 0.92, 0.08, soft], // barra de navegação
    [0.06, 0.2, 0.5, 0.16, strong], // título
    [0.06, 0.4, 0.38, 0.06, soft], // subtítulo
    [0.06, 0.52, 0.2, 0.1, strong], // botão
    [0.6, 0.2, 0.34, 0.42, soft], // imagem
    [0.04, 0.72, 0.28, 0.22, soft], // cards
    [0.36, 0.72, 0.28, 0.22, soft],
    [0.68, 0.72, 0.28, 0.22, soft],
  ];
  const meshes = pieces.map(([px, py, pw, ph, m]) => {
    const piece = new Mesh(new BoxGeometry(pw * w, ph * h, 0.02), m);
    piece.position.set(-w / 2 + (px + pw / 2) * w, h / 2 - (py + ph / 2) * h, 0);
    root.add(piece);
    return piece;
  });
  root.position.set(at.x, at.y, at.z);
  return {
    object: root,
    update({ t, active }) {
      // A vitrine acende azul enquanto a porta de aço sobe (Action "lp", t 0 → 0,45)
      glass.userData.base = ACCENT.lpScreen;
      glass.userData.litScale = 0.2;
      glass.userData.screen = smoothstep(0.05, 0.4, t) * 0.75; // fundo da tela, somado em world.ts
      root.visible = t > 0;
      meshes.forEach((m, i) => {
        const k = easeOut(smoothstep(0.1 + i * 0.09, 0.25 + i * 0.09, t));
        m.scale.set(k, k, 1);
        m.position.z = (1 - k) * 0.6;
      });
      strong.color.setScalar(0.7 + 0.3 * Math.max(active, 0.4));
    },
  };
}

/** Redes sociais: cards de post saem pela porta e entram em órbita na frente do salão. */
function orbitingPosts(door: Street["anchors"]["socialDoor"]): Effect {
  const root = new Group();
  const cardMat = new MeshBasicMaterial({ color: 0xbdbdbd });
  const lineMat = new MeshBasicMaterial({ color: 0x5a5a5a });
  const n = 7;
  const cards = Array.from({ length: n }, (_, i) => {
    const card = new Group();
    card.add(new Mesh(new BoxGeometry(0.62, 0.8, 0.03), cardMat));
    const photo = new Mesh(new BoxGeometry(0.52, 0.48, 0.035), tinted(ACCENT.posts[i % ACCENT.posts.length]!));
    photo.position.y = 0.09;
    const line = new Mesh(new BoxGeometry(0.32, 0.05, 0.035), lineMat);
    line.position.set(-0.08, -0.27, 0);
    card.add(photo, line);
    root.add(card);
    return card;
  });
  const start = new Vector3(...door);
  const center = new Vector3(door[0], 2.5, door[2] + 1.6);
  const target = new Vector3();
  return {
    object: root,
    update({ t, time, camera }) {
      root.visible = t > 0;
      cards.forEach((card, i) => {
        const k = easeOut(smoothstep(i * 0.08, 0.4 + i * 0.08, t));
        const a = (i / n) * Math.PI * 2 + time * 0.35;
        target.set(center.x + Math.cos(a) * 2.4, center.y + Math.sin(a * 2) * 0.35, center.z + Math.sin(a) * 1.1);
        card.position.lerpVectors(start, target, k);
        card.scale.setScalar(0.2 + 0.8 * k);
        card.lookAt(camera.position);
      });
    },
  };
}

/** Tráfego pago: o outdoor liga e emite ondas de alcance pelo bairro. */
function reachWaves(billboard: Street["anchors"]["billboard"], glass: MeshStandardMaterial): Effect {
  const root = new Group();
  const geo = new RingGeometry(0.965, 1, 64);
  geo.rotateX(-Math.PI / 2);
  glass.userData.base = ACCENT.billboard;
  glass.userData.litScale = 0.4; // painel aceso, mas sem estourar no bloom
  const rings = Array.from({ length: 4 }, () => {
    const m = new Mesh(geo, glow(0, ACCENT.wave));
    root.add(m);
    return m;
  });
  root.position.set(...billboard.base);
  return {
    object: root,
    update({ t, time }) {
      // Liga piscando, como lâmpada fria
      const on = smoothstep(0.05, 0.35, t);
      const flicker = t < 0.35 && t > 0.05 ? (Math.sin(time * 47) > -0.2 ? 1 : 0.25) : 1;
      glass.userData.billboard = on * flicker;
      const reach = smoothstep(0.3, 0.85, t);
      root.visible = reach > 0;
      rings.forEach((r, i) => {
        const phase = (time * 0.22 + i / rings.length) % 1;
        r.scale.setScalar(0.5 + phase * 11 * reach);
        (r.material as MeshBasicMaterial).opacity = (1 - phase) ** 1.5 * 0.9 * reach;
      });
    },
  };
}

/** IA: holograma de influenciadora sobre um emissor na calçada do estúdio. */
function hologram(stage: Street["anchors"]["aiStage"]): Effect {
  const root = new Group();
  const emitter = new Mesh(new CylinderGeometry(0.85, 0.95, 0.12, 24), new MeshBasicMaterial({ color: 0x1e1e1e }));
  const rim = new Mesh(new TorusGeometry(0.88, 0.03, 6, 48), tinted(ACCENT.holoWire));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.07;
  root.add(emitter, rim);

  const beam = new Mesh(new CylinderGeometry(0.55, 0.85, 2.5, 24, 1, true), glow(0.06, ACCENT.holoWire));
  beam.position.y = 1.3;
  root.add(beam);

  // Silhueta low-poly: cabeça, cabelo, tronco, saia, pernas e braços
  const figure = new Group();
  const wire = new MeshBasicMaterial({ color: ACCENT.holoWire, wireframe: true, transparent: true, opacity: 0.85 });
  const fill = glow(0.18, ACCENT.holoFill);
  const part = (geo: ConstructorParameters<typeof Mesh>[0], x: number, y: number, z = 0, rz = 0) => {
    for (const m of [wire, fill]) {
      const p = new Mesh(geo, m);
      p.position.set(x, y, z);
      p.rotation.z = rz;
      figure.add(p);
    }
  };
  part(new IcosahedronGeometry(0.17, 1), 0, 1.86);
  part(new IcosahedronGeometry(0.2, 0), 0, 1.9, -0.05);
  part(new CylinderGeometry(0.07, 0.11, 0.42, 6), 0, 1.66, -0.12);
  part(new CylinderGeometry(0.05, 0.05, 0.1, 6), 0, 1.66);
  part(new CylinderGeometry(0.2, 0.15, 0.5, 7), 0, 1.36);
  part(new CylinderGeometry(0.15, 0.32, 0.5, 8), 0, 0.88);
  part(new CylinderGeometry(0.05, 0.04, 0.62, 5), -0.08, 0.32);
  part(new CylinderGeometry(0.05, 0.04, 0.62, 5), 0.08, 0.32);
  part(new CylinderGeometry(0.04, 0.035, 0.6, 5), -0.27, 1.28, 0, -0.18);
  part(new CylinderGeometry(0.04, 0.035, 0.6, 5), 0.27, 1.28, 0, 0.18);
  figure.position.y = 0.12;
  root.add(figure);

  const scan = new Mesh(new TorusGeometry(0.5, 0.012, 4, 40), tinted(ACCENT.holoFill.clone().multiplyScalar(2)));
  scan.rotation.x = Math.PI / 2;
  root.add(scan);

  root.position.set(...stage);
  return {
    object: root,
    update({ t, time }) {
      const on = smoothstep(0, 0.5, t);
      root.visible = t > 0;
      const flicker = on < 1 ? (Math.sin(time * 39 + t * 20) > 0 ? 1 : 0.35) : 0.92 + Math.sin(time * 7) * 0.08;
      wire.opacity = 0.85 * on * flicker;
      fill.opacity = 0.18 * on * flicker;
      (beam.material as MeshBasicMaterial).opacity = 0.06 * on;
      figure.scale.set(1, clamp01(on * 1.2), 1);
      figure.rotation.y = time * 0.4;
      scan.visible = on > 0.2;
      scan.position.y = 0.2 + ((time * 0.45) % 1) * 1.9;
    },
  };
}

/** Efeito de cada seção, na ordem de SECTIONS (hero e contato não têm efeito próprio). */
export function buildEffects(street: Street): (Effect | null)[] {
  const { anchors, facades } = street;
  return [
    null,
    mapsPin(anchors.gmbRoof),
    screenBuild(anchors.lpWindow, facades.shop_lp!.glass),
    orbitingPosts(anchors.socialDoor),
    reachWaves(anchors.billboard, facades.billboard_ads!.glass),
    hologram(anchors.aiStage),
    null,
  ];
}
