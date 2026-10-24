import { holdEase } from "./timeline";

export type Vec3 = readonly [number, number, number];

export interface CameraKey {
  position: Vec3;
  target: Vec3;
}

// Posição das fachadas ao longo da rua (eixo X). A cena e a câmera leem daqui.
export const FACADE_X = { gmb: 0, lp: 7, social: 14, ads: 21, ai: 32 } as const;

// Um quadro por seção, na ordem de SECTIONS.
export const CAMERA_KEYS: readonly CameraKey[] = [
  { position: [15, 30, 20], target: [15, 0, -3.5] }, // hero: a rua inteira vista do alto
  { position: [2.6, 3.6, 9], target: [0, 3, -3] }, // padaria e o pin do Maps
  { position: [8.2, 2.4, 6.4], target: [7, 1.8, -3] }, // vitrine que vira tela
  { position: [15.8, 3, 8.6], target: [14, 2.4, -3] }, // salão e os posts em órbita
  { position: [15.5, 9.5, 14], target: [21, 2.5, -2] }, // outdoor e as ondas de alcance
  { position: [32.4, 2.7, 4.4], target: [32, 2.5, -3] }, // estúdio: aproxima do holograma
  { position: [15, 22, 30], target: [15, 1, -3] }, // contato: recua, bairro aceso
];

/**
 * Celular em pé: a vista de cima mostraria o bairro inteiro pequeno. O hero começa com
 * zoom no ponto de luz que pousa na rua e corre de lado até a padaria; no contato a câmera
 * fica mais perto, mostrando uma faixa vertical do bairro aceso em vez da rua inteira.
 */
export const CAMERA_KEYS_PORTRAIT: readonly CameraKey[] = CAMERA_KEYS.map((key, i, keys) => {
  if (i === 0) return { position: [15, 5.2, 7.6], target: [15, 0.3, 0.2] };
  if (i === keys.length - 1) return { position: [17, 9, 12.5], target: [17, 3, -4.5] };
  return key;
});

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => [
  lerp(a[0], b[0], t),
  lerp(a[1], b[1], t),
  lerp(a[2], b[2], t),
];

/** Câmera no progresso `p` (0 … CAMERA_KEYS.length − 1). */
export function cameraAt(p: number, keys: readonly CameraKey[] = CAMERA_KEYS): CameraKey {
  const last = keys.length - 1;
  const clamped = Math.min(last, Math.max(0, p));
  const i = Math.min(last - 1, Math.floor(clamped));
  const from = keys[i]!;
  const to = keys[i + 1] ?? from;
  const t = holdEase(clamped - i);
  return { position: lerp3(from.position, to.position, t), target: lerp3(from.target, to.target, t) };
}

/**
 * Campo de visão vertical para manter a mesma largura de cena em qualquer tela:
 * no celular em pé o vertical abre, para a rua não sair pelas laterais.
 */
export function verticalFov(aspect: number, horizontalFovDeg = 68): number {
  const h = (horizontalFovDeg * Math.PI) / 180;
  const v = (2 * Math.atan(Math.tan(h / 2) / aspect) * 180) / Math.PI;
  return Math.min(80, Math.max(38, v));
}
