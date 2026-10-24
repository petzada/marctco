import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  type BufferGeometry,
  type Material,
} from "three";
import { FACADE_X } from "../camera-path";

// Rua em maquete com fachadas provisórias. Os nomes dos grupos são os das coleções do
// .blend (shop_gmb, shop_lp, shop_social, billboard_ads, studio_ai, street): quando o
// .glb existir, cada grupo provisório é trocado pelo objeto de mesmo nome.

export const SLOT_NAMES = ["street", "shop_gmb", "shop_lp", "shop_social", "billboard_ads", "studio_ai"] as const;
export type SlotName = (typeof SLOT_NAMES)[number];

/** Fachada que cada seção acende, na ordem de SECTIONS (hero e contato não têm). */
export const SECTION_SLOT: readonly (SlotName | null)[] = [
  null,
  "shop_gmb",
  "shop_lp",
  "shop_social",
  "billboard_ads",
  "studio_ai",
  null,
];

const gray = (hex: number) => new MeshStandardMaterial({ color: hex, roughness: 0.92, flatShading: true });

const MAT = {
  base: gray(0x161616),
  edge: gray(0x0f0f0f),
  road: gray(0x222222),
  lane: gray(0x4a4a4a),
  sidewalk: gray(0x3a3a3a),
  wall: gray(0x5a5a5a),
  wallDark: gray(0x474747),
  filler: gray(0x2f2f2f),
  roof: gray(0x2b2b2b),
  trim: gray(0x707070),
  door: gray(0x1c1c1c),
  pole: gray(0x3d3d3d),
};

/** Vidro que acende: escuro apagado, branco puro (com bloom) quando a intensidade passa de 1. */
export function glassMaterial(): MeshStandardMaterial {
  return new MeshStandardMaterial({ color: 0x1a1a1a, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.4 });
}

function mesh(geo: BufferGeometry, mat: Material, x: number, y: number, z: number): Mesh {
  const m = new Mesh(geo, mat);
  m.position.set(x, y, z);
  return m;
}

const box = (w: number, h: number, d: number, mat: Material, x: number, y: number, z: number) =>
  mesh(new BoxGeometry(w, h, d), mat, x, y, z);

/** Telhado de duas águas: prisma triangular deitado ao longo de X. */
function gable(w: number, h: number, d: number, mat: Material, x: number, y: number, z: number): Mesh {
  const geo = new CylinderGeometry(1, 1, w, 3, 1);
  geo.rotateZ(Math.PI / 2);
  geo.rotateX(-Math.PI / 2); // cumeeira para cima, base plana em y = −h/3
  geo.scale(1, h / 1.5, d / Math.sqrt(3));
  return mesh(geo, mat, x, y + h / 3, z);
}

export interface Facade {
  group: Group;
  glass: MeshStandardMaterial;
}

export interface Street {
  root: Group;
  slots: Record<SlotName, Group>;
  /** Vidros de cada fachada de serviço. */
  facades: Partial<Record<SlotName, Facade>>;
  /** Janelas dos prédios de enchimento: só acendem no contato. */
  fillerGlass: MeshStandardMaterial[];
  lampGlass: MeshStandardMaterial;
  /** Pontos de ancoragem dos efeitos de cada seção. */
  anchors: {
    gmbRoof: [number, number, number];
    lpWindow: { x: number; y: number; z: number; w: number; h: number };
    socialDoor: [number, number, number];
    billboard: { x: number; y: number; z: number; w: number; h: number; base: [number, number, number] };
    aiStage: [number, number, number];
  };
}

const FRONT = -3; // z da frente das fachadas do lado de cá da rua

function windows(glass: Material, xs: number[], y: number, w: number, h: number, z: number): Mesh[] {
  return xs.map((x) => box(w, h, 0.06, glass, x, y, z));
}

function bakery(): Facade {
  const g = new Group();
  const glass = glassMaterial();
  const x = FACADE_X.gmb;
  const w = 4.6;
  const d = 3.2;
  g.add(box(w, 3.2, d, MAT.wall, x, 1.6, FRONT - d / 2));
  g.add(gable(w + 0.3, 1.5, d + 0.4, MAT.roof, x, 3.2, FRONT - d / 2));
  g.add(box(1.0, 2.0, 0.08, MAT.door, x, 1.0, FRONT + 0.01));
  g.add(...windows(glass, [x - 1.5, x + 1.5], 1.5, 1.1, 1.2, FRONT + 0.02));
  // Toldo em ripas alternadas
  for (let i = 0; i < 8; i++) {
    const slat = box(w / 8, 0.06, 0.9, i % 2 ? MAT.trim : MAT.wallDark, x - w / 2 + w / 16 + (i * w) / 8, 2.45, FRONT + 0.42);
    slat.rotation.x = 0.35;
    g.add(slat);
  }
  g.add(box(1.8, 0.4, 0.1, MAT.trim, x, 2.85, FRONT + 0.05));
  return { group: g, glass };
}

function shop(): Facade {
  const g = new Group();
  const glass = glassMaterial();
  const x = FACADE_X.lp;
  const d = 3.4;
  g.add(box(5.2, 3.8, d, MAT.wallDark, x, 1.9, FRONT - d / 2));
  g.add(box(5.4, 0.3, d + 0.2, MAT.roof, x, 3.95, FRONT - d / 2));
  g.add(box(5.2, 0.5, 0.12, MAT.trim, x, 3.3, FRONT + 0.04));
  g.add(box(0.9, 2.1, 0.08, MAT.door, x + 2.0, 1.05, FRONT + 0.01));
  // A vitrine: a tela da landing page se monta na frente dela
  g.add(box(3.6, 2.0, 0.06, glass, x - 0.55, 1.45, FRONT + 0.02));
  g.add(box(3.8, 0.12, 0.3, MAT.trim, x - 0.55, 0.4, FRONT + 0.12));
  return { group: g, glass };
}

function salon(): Facade {
  const g = new Group();
  const glass = glassMaterial();
  const x = FACADE_X.social;
  const d = 3.2;
  g.add(box(4.4, 3.4, d, MAT.wall, x, 1.7, FRONT - d / 2));
  g.add(box(4.6, 0.6, d + 0.2, MAT.roof, x, 3.7, FRONT - d / 2));
  g.add(box(1.1, 2.1, 0.08, MAT.door, x, 1.05, FRONT + 0.01));
  g.add(...windows(glass, [x - 1.45, x + 1.45], 1.6, 0.9, 1.3, FRONT + 0.02));
  const circle = new Mesh(new CylinderGeometry(0.4, 0.4, 0.06, 10), glass);
  circle.rotation.x = Math.PI / 2;
  circle.position.set(x, 2.75, FRONT + 0.03);
  g.add(circle);
  // Poste de barbearia em faixas de cinza
  for (let i = 0; i < 5; i++) {
    g.add(mesh(new CylinderGeometry(0.1, 0.1, 0.24, 8), i % 2 ? MAT.trim : MAT.door, x + 0.85, 1.2 + i * 0.24, FRONT + 0.2));
  }
  return { group: g, glass };
}

function corner(): Facade & { billboard: Street["anchors"]["billboard"] } {
  const g = new Group();
  const glass = glassMaterial();
  const x = FACADE_X.ads;
  g.add(box(3.6, 2.8, 3.2, MAT.wallDark, x - 1.8, 1.4, FRONT - 1.6));
  g.add(box(0.9, 1.9, 0.08, MAT.door, x - 1.8, 0.95, FRONT + 0.01));
  // Outdoor sobre dois postes, virado para a rua
  const bx = x + 1.2;
  const bz = FRONT - 0.6;
  for (const dx of [-1.4, 1.4]) g.add(box(0.14, 4.4, 0.14, MAT.pole, bx + dx, 2.2, bz - 0.15));
  g.add(box(4.6, 2.4, 0.2, MAT.edge, bx, 5.6, bz - 0.2));
  const panel = box(4.4, 2.2, 0.04, glass, bx, 5.6, bz - 0.08);
  g.add(panel);
  // Peças escuras sobre o painel: lê como anúncio quando ele liga
  g.add(box(2.4, 0.42, 0.03, MAT.door, bx - 0.8, 6.15, bz - 0.04));
  g.add(box(1.6, 0.18, 0.03, MAT.door, bx - 1.2, 5.6, bz - 0.04));
  g.add(box(1.1, 1.1, 0.03, MAT.door, bx + 1.3, 5.45, bz - 0.04));
  return {
    group: g,
    glass,
    billboard: { x: bx, y: 5.6, z: bz, w: 4.4, h: 2.2, base: [bx, 0.06, bz + 1] },
  };
}

function studio(): Facade {
  const g = new Group();
  const glass = glassMaterial();
  const x = FACADE_X.ai;
  const d = 4;
  g.add(box(6.4, 4.2, d, MAT.wallDark, x, 2.1, FRONT - d / 2));
  g.add(box(6.6, 0.3, d + 0.2, MAT.roof, x, 4.35, FRONT - d / 2));
  // Abertura do estúdio e uma faixa de vidro alta
  g.add(box(3.6, 3.0, 0.08, MAT.door, x, 1.5, FRONT + 0.01));
  g.add(box(3.8, 0.12, 0.06, glass, x, 3.15, FRONT + 0.03));
  g.add(box(0.5, 3.2, 0.06, glass, x + 2.5, 1.9, FRONT + 0.02));
  return { group: g, glass };
}

function filler(x: number, z: number, w: number, h: number, facing: 1 | -1, out: MeshStandardMaterial[]): Group {
  const g = new Group();
  const d = 3.2;
  g.add(box(w, h, d, MAT.filler, x, h / 2, z + (facing === 1 ? -d / 2 : d / 2)));
  const front = z + facing * 0.02;
  const cols = Math.max(1, Math.round(w / 1.3));
  for (let row = 0; row < Math.floor((h - 0.6) / 1.1); row++) {
    for (let c = 0; c < cols; c++) {
      const m = glassMaterial();
      m.emissive.set(0xffc46b); // só acende no final, já em cor quente
      m.userData.level = 0.5 + ((x * 7 + row * 3 + c * 5) % 10) / 9; // brilho fixo por janela
      m.userData.on = (x * 13 + row * 7 + c * 11) % 3 !== 0; // nem toda janela acende
      out.push(m);
      g.add(box(0.6, 0.7, 0.06, m, x - w / 2 + (w / cols) * (c + 0.5), 1.1 + row * 1.1, front));
    }
  }
  return g;
}

function tree(x: number, z: number): Group {
  const g = new Group();
  g.add(box(0.16, 0.9, 0.16, MAT.pole, x, 0.45, z));
  const crown = mesh(new ConeGeometry(0.6, 1.3, 6), MAT.wallDark, x, 1.5, z);
  crown.rotation.y = x;
  g.add(crown);
  return g;
}

function lamp(x: number, z: number, glass: Material): Group {
  const g = new Group();
  g.add(box(0.08, 2.6, 0.08, MAT.pole, x, 1.3, z));
  g.add(box(0.5, 0.06, 0.08, MAT.pole, x, 2.6, z - Math.sign(z) * 0.2));
  g.add(box(0.22, 0.1, 0.22, glass, x, 2.52, z - Math.sign(z) * 0.4));
  return g;
}

export function buildStreet(): Street {
  const root = new Group();
  const slots = Object.fromEntries(SLOT_NAMES.map((n) => [n, Object.assign(new Group(), { name: n })])) as Record<
    SlotName,
    Group
  >;

  // Base da maquete, ruas, calçadas
  const s = slots.street;
  s.add(box(50, 0.8, 19, MAT.base, 15, -0.4, -2.5));
  s.add(box(50.4, 0.2, 19.4, MAT.edge, 15, -0.75, -2.5));
  s.add(box(50, 0.02, 3, MAT.road, 15, 0.01, 0));
  s.add(box(3, 0.02, 19, MAT.road, 25.5, 0.012, -2.5));
  for (let x = -9; x < 40; x += 2) if (x < 23.5 || x > 27.5) s.add(box(0.9, 0.025, 0.12, MAT.lane, x, 0.02, 0));
  for (const [x0, x1] of [
    [-10, 24],
    [27, 40],
  ] as const) {
    s.add(box(x1 - x0, 0.12, 1.5, MAT.sidewalk, (x0 + x1) / 2, 0.06, -2.25));
    s.add(box(x1 - x0, 0.12, 1.5, MAT.sidewalk, (x0 + x1) / 2, 0.06, 2.25));
  }

  const fillerGlass: MeshStandardMaterial[] = [];
  // Prédios de enchimento entre as fachadas e do outro lado da rua
  for (const [x, w, h] of [
    [-5, 3.6, 4.4],
    [3.6, 2.4, 5.2],
    [10.6, 2.6, 4.6],
    [17.6, 2.4, 5.8],
    [37.4, 3.8, 5],
  ] as const) {
    s.add(filler(x, FRONT, w, h, 1, fillerGlass));
  }
  // Fileira de trás, mais alta: aparece por cima das lojas e acende no contato
  for (const [x, w, h] of [
    [-6, 4.4, 7],
    [-1, 4.6, 8.4],
    [4, 4.2, 6.6],
    [9, 4.8, 9.2],
    [14, 4.4, 7.4],
    [19, 4.6, 8.6],
    [30, 4.8, 7.8],
    [35.5, 5, 9],
  ] as const) {
    s.add(filler(x, -8.6, w, h, 1, fillerGlass));
  }
  // Do outro lado da rua só árvores e bancos: nada alto entre a câmera e as fachadas
  for (const x of [-7.5, -3, 3.5, 10.5, 17.5, 22, 30, 36.5]) s.add(tree(x, 4));
  for (const x of [1.5, 8.5, 15.5, 33.5]) s.add(box(1.4, 0.3, 0.4, MAT.trim, x, 0.45, 2.6));

  const lampGlass = glassMaterial();
  lampGlass.emissive.set(0xffd9a0);
  // Postes nos vãos entre fachadas, para não cruzar a frente de nenhuma vitrine
  for (const x of [-7, 3.6, 10.6, 17.6, 28, 37]) s.add(lamp(x, -1.7, lampGlass));
  for (const x of [-4, 3.6, 10.6, 17.6, 28.5, 37]) s.add(lamp(x, 1.7, lampGlass));

  const gmb = bakery();
  const lp = shop();
  const social = salon();
  const ads = corner();
  const ai = studio();
  slots.shop_gmb.add(gmb.group);
  slots.shop_lp.add(lp.group);
  slots.shop_social.add(social.group);
  slots.billboard_ads.add(ads.group);
  slots.studio_ai.add(ai.group);
  root.add(...Object.values(slots));

  return {
    root,
    slots,
    facades: { shop_gmb: gmb, shop_lp: lp, shop_social: social, billboard_ads: ads, studio_ai: ai },
    fillerGlass,
    lampGlass,
    anchors: {
      gmbRoof: [FACADE_X.gmb, 4.4, FRONT - 1.6],
      lpWindow: { x: FACADE_X.lp - 0.55, y: 1.45, z: FRONT + 0.1, w: 3.6, h: 2.0 },
      socialDoor: [FACADE_X.social, 1.1, FRONT + 0.2],
      billboard: ads.billboard,
      aiStage: [FACADE_X.ai, 0.12, FRONT + 1.2],
    },
  };
}
