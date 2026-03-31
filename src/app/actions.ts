"use server";

import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import {
  saveOriginal,
  saveCompressed,
  saveMeta,
  type FileMeta,
} from "@/lib/storage";
import { compressPdf } from "@/lib/compress";

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 Mo (Vercel function limit)

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
    return { success: false, error: "Fichier trop volumineux (max 50 Mo)." };
  }

  const parsed = uploadSchema.safeParse({
    targetSizeMb: formData.get("targetSizeMb")?.toString(),
  });

  const targetSizeMb = parsed.success ? parsed.data.targetSizeMb : null;

  const id = uuidv4();
  const arrayBuffer = await file.arrayBuffer();
  const inputData = new Uint8Array(arrayBuffer);

  // Save original to Vercel Blob
  const originalUrl = await saveOriginal(id, inputData, file.name);

  // Create initial metadata
  const meta: FileMeta = {
    id,
    originalName: file.name,
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
