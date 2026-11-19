"use server";

import { headers } from "next/headers";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import {
  saveOriginal,
  saveCompressed,
  saveMeta,
  type FileMeta,
} from "@/lib/storage";
import { compressPdf } from "@/lib/compress";
import { DAY, HOUR, ipHash, takeAll } from "@/lib/rate-limit";

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 Mo (même borne que bodySizeLimit)

// Dépôt anonyme vers un stockage public + compression gourmande en CPU :
// débit limité par IP, plafond global par jour.
const PER_IP_HOUR = 5;
const PER_IP_DAY = 15;
const GLOBAL_PER_DAY = 100;

async function allowed(): Promise<boolean> {
  try {
    const ip = ipHash((await headers()).get("x-forwarded-for"));
    return takeAll([
      { key: `up:h:${ip}`, max: PER_IP_HOUR, windowMs: HOUR },
      { key: `up:d:${ip}`, max: PER_IP_DAY, windowMs: DAY },
      { key: "up:global", max: GLOBAL_PER_DAY, windowMs: DAY },
    ]);
  } catch {
    return false; // limiteur en panne : on refuse
  }
}

/** Un vrai PDF commence par « %PDF- » (toléré dans le premier kilo-octet). */
function looksLikePdf(data: Uint8Array): boolean {
  return Buffer.from(data.subarray(0, 1024)).includes("%PDF-");
}

/** Nom d'origine conservé pour le téléchargement : sans caractères de contrôle ni guillemets. */
function safeName(name: string): string {
  const base = name.replace(/[\u0000-\u001f\u007f"\\/]/g, "").trim().slice(0, 150);
  return base.toLowerCase().endsWith(".pdf") ? base : "document.pdf";
}

const uploadSchema = z.object({
  targetSizeMb: z
    .string()
    .optional()
    .transform((v) => {
      if (!v || v.trim() === "") return null;
      const n = parseFloat(v);
      if (isNaN(n) || n <= 0) return null;
      return n;
    }),
});

export interface UploadResult {
  success: boolean;
  id?: string;
  meta?: FileMeta;
  error?: string;
}

export async function uploadAndCompress(
  formData: FormData
): Promise<UploadResult> {
  const file = formData.get("pdf") as File | null;
  if (!file || file.size === 0) {
    return { success: false, error: "Aucun fichier sélectionné." };
  }

  if (!file.name.toLowerCase().endsWith(".pdf")) {
    return { success: false, error: "Seuls les fichiers PDF sont acceptés." };
  }

  if (file.size > MAX_FILE_SIZE) {
    return { success: false, error: "Fichier trop volumineux (max 20 Mo)." };
  }

  if (!(await allowed())) {
    return {
      success: false,
      error: "Trop de fichiers envoyés depuis cette adresse. Réessayez plus tard.",
    };
  }

  const parsed = uploadSchema.safeParse({
    targetSizeMb: formData.get("targetSizeMb")?.toString(),
  });

  const targetSizeMb = parsed.success ? parsed.data.targetSizeMb : null;

  const id = uuidv4();
  const arrayBuffer = await file.arrayBuffer();
  const inputData = new Uint8Array(arrayBuffer);

  // Rien ne part vers le stockage public tant que ce n'est pas un PDF.
  if (!looksLikePdf(inputData)) {
    return { success: false, error: "Ce fichier n'est pas un PDF valide." };
  }
  const originalName = safeName(file.name);

  // Save original to Vercel Blob
  const originalUrl = await saveOriginal(id, inputData, originalName);

  // Create initial metadata
  const meta: FileMeta = {
    id,
    originalName,
    originalSize: file.size,
    compressedSize: null,
    targetSizeMb,
    qualityUsed: null,
    ratio: null,
    status: "pending",
    createdAt: new Date().toISOString(),
    originalUrl,
  };
  await saveMeta(meta);

  // Compress
  try {
    const result = compressPdf(inputData, targetSizeMb);

    // Save compressed to Vercel Blob
    const compressedUrl = await saveCompressed(id, result.compressedBuffer);

    meta.compressedSize = result.compressedBuffer.length;
    meta.qualityUsed = result.qualityUsed;
    meta.ratio = Math.round(
      (1 - result.compressedBuffer.length / file.size) * 100
    );
    meta.status = "compressed";
    meta.compressedUrl = compressedUrl;
    await saveMeta(meta);

    return { success: true, id, meta };
  } catch (err) {
    meta.status = "error";
    meta.error = err instanceof Error ? err.message : "Erreur inconnue";
    await saveMeta(meta);
    return { success: false, error: meta.error };
  }
}
