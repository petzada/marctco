// Matemática do passeio, sem three.js nem DOM: o scroll vira um progresso contínuo `p`,
// em que `p = i` é a câmera parada diante da seção i.

export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/**
 * `anchors[i]` é o scrollY em que a seção i está no meio do seu trecho fixo (sticky).
 * Entre âncoras o progresso é linear; antes da primeira é 0 e depois da última, o índice final.
 */
export function progressAt(scrollY: number, anchors: readonly number[]): number {
  const last = anchors.length - 1;
  if (last < 0) return 0;
  if (scrollY <= anchors[0]!) return 0;
  if (scrollY >= anchors[last]!) return last;
  let i = 0;
  while (scrollY > anchors[i + 1]!) i++;
  const span = anchors[i + 1]! - anchors[i]!;
  return i + (span > 0 ? (scrollY - anchors[i]!) / span : 0);
}

/** Âncora de cada seção: o meio do intervalo em que o painel sticky fica parado na tela. */
export function anchorsFor(
  sections: readonly { top: number; height: number }[],
  viewportHeight: number,
): number[] {
  return sections.map(({ top, height }) => top + Math.max(0, height - viewportHeight) / 2);
}

/**
 * Entre duas seções a câmera segura perto de cada ponta e viaja no meio do trecho,
 * para o texto da seção ter tempo de leitura com a cena parada.
 */
export function holdEase(frac: number): number {
  return smoothstep(0.2, 0.8, frac);
}

/** Com movimento reduzido o passeio vira quadros: a câmera pula para a seção mais próxima. */
export function snapProgress(p: number): number {
  return Math.round(p);
}

/** Quanto a fachada i está "acesa" como ativa: 1 na frente dela, 0 a uma seção de distância. */
export function activation(p: number, i: number): number {
  return 1 - smoothstep(0.25, 0.85, Math.abs(p - i));
}

/**
 * Progresso local do efeito da seção i: toca enquanto a câmera está parada diante da
 * fachada (p de i − 0,3 a i + 0,15) e fica completo dali em diante.
 */
export function effectProgress(p: number, i: number): number {
  return clamp01((p - (i - 0.3)) / 0.45);
}
