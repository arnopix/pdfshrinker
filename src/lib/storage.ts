import { put, list, head } from "@vercel/blob";

const PREFIX = "pdf-shrinker";

export interface FileMeta {
  id: string;
  originalName: string;
  originalSize: number;
  compressedSize: number | null;
  targetSizeMb: number | null;
  qualityUsed: string | null;
  ratio: number | null;
  status: "pending" | "compressed" | "error";
  error?: string;
  createdAt: string;
  originalUrl?: string;
  compressedUrl?: string;
}

export async function saveOriginal(id: string, buffer: Uint8Array, fileName: string) {
  const blob = await put(`${PREFIX}/originals/${id}.pdf`, Buffer.from(buffer), {
    access: "public",
    contentType: "application/pdf",
    addRandomSuffix: false,
  });
  return blob.url;
}

export async function saveCompressed(id: string, buffer: Uint8Array) {
  const blob = await put(`${PREFIX}/compressed/${id}.pdf`, Buffer.from(buffer), {
    access: "public",
    contentType: "application/pdf",
    addRandomSuffix: false,
  });
  return blob.url;
}

export async function saveMeta(meta: FileMeta) {
  await put(`${PREFIX}/meta/${meta.id}.json`, JSON.stringify(meta), {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: false,
  });
}

export async function getMeta(id: string): Promise<FileMeta | null> {
  try {
    const { blobs } = await list({ prefix: `${PREFIX}/meta/${id}.json` });
    if (blobs.length === 0) return null;
    const res = await fetch(blobs[0].url);
    return (await res.json()) as FileMeta;
  } catch {
    return null;
  }
}

export async function getCompressedUrl(id: string): Promise<string | null> {
  try {
    const { blobs } = await list({ prefix: `${PREFIX}/compressed/${id}.pdf` });
    if (blobs.length === 0) return null;
    return blobs[0].url;
  } catch {
    return null;
  }
}
