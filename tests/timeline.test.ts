import { describe, expect, it } from "vitest";
import { CAMERA_KEYS, cameraAt, verticalFov } from "../src/camera-path";
import { SECTIONS } from "../src/content";
import { activation, anchorsFor, effectProgress, holdEase, progressAt, snapProgress } from "../src/timeline";

describe("progressAt", () => {
  const anchors = [0, 1000, 3000];

  it("é o índice exato em cada âncora", () => {
    expect(progressAt(0, anchors)).toBe(0);
    expect(progressAt(1000, anchors)).toBe(1);
    expect(progressAt(3000, anchors)).toBe(2);
  });

  it("interpola linearmente entre âncoras de tamanhos diferentes", () => {
    expect(progressAt(500, anchors)).toBeCloseTo(0.5);
    expect(progressAt(2000, anchors)).toBeCloseTo(1.5);
  });

  it("fica preso nas pontas", () => {
    expect(progressAt(-200, anchors)).toBe(0);
    expect(progressAt(9999, anchors)).toBe(2);
  });
});

describe("anchorsFor", () => {
  it("é o meio do trecho em que o painel sticky fica parado", () => {
    expect(anchorsFor([{ top: 0, height: 1700 }, { top: 1700, height: 2300 }], 1000)).toEqual([350, 2350]);
  });
});

describe("cameraAt", () => {
  it("devolve o quadro exato de cada seção", () => {
    CAMERA_KEYS.forEach((key, i) => expect(cameraAt(i)).toEqual(key));
  });

  it("segura a câmera perto de cada seção para dar tempo de leitura", () => {
    expect(holdEase(0.15)).toBe(0);
    expect(holdEase(0.85)).toBe(1);
    expect(cameraAt(1.1)).toEqual(CAMERA_KEYS[1]);
  });

  it("tem um quadro por seção", () => {
    expect(CAMERA_KEYS).toHaveLength(SECTIONS.length);
  });
});

describe("activation e effectProgress", () => {
  it("acende só a fachada da frente", () => {
    expect(activation(2, 2)).toBe(1);
    expect(activation(3, 2)).toBe(0);
  });

  it("o efeito completa enquanto a câmera está parada e não volta atrás", () => {
    expect(effectProgress(1.7, 2)).toBe(0);
    expect(effectProgress(2.16, 2)).toBe(1);
    expect(effectProgress(5, 2)).toBe(1);
  });

  it("movimento reduzido pula para a seção mais próxima", () => {
    expect(snapProgress(1.4)).toBe(1);
    expect(snapProgress(1.6)).toBe(2);
  });
});

describe("verticalFov", () => {
  it("abre o campo vertical no celular em pé e respeita os limites", () => {
    expect(verticalFov(0.46)).toBeGreaterThan(verticalFov(16 / 9));
    expect(verticalFov(0.2)).toBe(80);
    expect(verticalFov(4)).toBe(38);
  });
});
