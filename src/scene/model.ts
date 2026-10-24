// O .glb do bairro, sem three.js: main.ts começa o download junto com o chunk da cena.
// Importado como asset, o arquivo sai com hash no nome e o Cloudflare o serve de cache imutável.
import modelUrl from "../models/bairro.glb?url";

export const MODEL_URL = modelUrl;

/** Baixa o .glb; sem arquivo ou com outro conteúdo, devolve null (ficam as caixas provisórias). */
export async function fetchModel(url: string = MODEL_URL): Promise<ArrayBuffer | null> {
  // Prioridade baixa: não disputa banda com CSS, fontes e o chunk do three.js (LCP é o texto)
  const res = await fetch(url, { priority: "low" } as RequestInit).catch(() => null);
  if (!res?.ok) return null;
  const buffer = await res.arrayBuffer();
  // Magic "glTF" no início: o que um servidor devolve no lugar de um 404 (o index.html) não passa
  return buffer.byteLength > 12 && new DataView(buffer).getUint32(0, true) === 0x46546c67 ? buffer : null;
}
