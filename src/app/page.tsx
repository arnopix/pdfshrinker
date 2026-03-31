"use client";

import { useState, useRef } from "react";
import { uploadAndCompress, type UploadResult } from "./actions";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} Mo`;
}

export default function Home() {
  const [result, setResult] = useState<UploadResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    setResult(null);
    try {
      const res = await uploadAndCompress(formData);
      setResult(res);
    } catch {
      setResult({ success: false, error: "Erreur lors de l'envoi." });
    } finally {
      setLoading(false);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setFileName(file ? file.name : null);
    setResult(null);
  }

  function handleReset() {
    setResult(null);
    setFileName(null);
    formRef.current?.reset();
  }

  return (
    <main className="flex-1 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold tracking-tight">PDF Shrinker</h1>
          <p className="text-foreground/60 mt-2">
            Réduisez la taille de vos fichiers PDF en un clic.
          </p>
        </div>

        <form
          ref={formRef}
          action={handleSubmit}
          className="border border-foreground/10 rounded-xl p-6 space-y-5 bg-foreground/[0.02]"
        >
          {/* File input */}
          <div>
            <label
              htmlFor="pdf"
              className="block text-sm font-medium mb-2"
            >
              Fichier PDF
            </label>
            <label
              htmlFor="pdf"
              className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-foreground/20 rounded-lg cursor-pointer hover:border-foreground/40 transition-colors"
            >
              <svg
                className="w-8 h-8 text-foreground/40 mb-2"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                />
              </svg>
              {fileName ? (
                <span className="text-sm font-medium">{fileName}</span>
              ) : (
                <span className="text-sm text-foreground/50">
                  Cliquez ou glissez un PDF ici
                </span>
              )}
              <input
                id="pdf"
                name="pdf"
                type="file"
                accept=".pdf,application/pdf"
                className="hidden"
                onChange={handleFileChange}
                required
              />
            </label>
          </div>

          {/* Target size (optional) */}
          <div>
            <label
              htmlFor="targetSizeMb"
              className="block text-sm font-medium mb-2"
            >
              Taille cible{" "}
              <span className="text-foreground/40 font-normal">(optionnel, en Mo)</span>
            </label>
            <input
              id="targetSizeMb"
              name="targetSizeMb"
              type="number"
              step="0.1"
              min="0.1"
              placeholder="Ex : 2.5"
              className="w-full px-3 py-2 rounded-lg border border-foreground/15 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
            />
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading || !fileName}
            className="w-full py-2.5 px-4 rounded-lg bg-foreground text-background font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? "Compression en cours…" : "Compresser"}
          </button>
        </form>

        {/* Result */}
        {result && (
          <div className="mt-6 border border-foreground/10 rounded-xl p-5 bg-foreground/[0.02]">
            {result.success && result.meta ? (
              <div className="space-y-3">
                <h2 className="font-semibold text-green-600 dark:text-green-400">
                  Compression réussie
                </h2>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <span className="text-foreground/60">Fichier original :</span>
                  <span>{result.meta.originalName}</span>
                  <span className="text-foreground/60">Taille originale :</span>
                  <span>{formatSize(result.meta.originalSize)}</span>
                  <span className="text-foreground/60">Taille compressée :</span>
                  <span className="font-medium">
                    {formatSize(result.meta.compressedSize!)}
                  </span>
                  <span className="text-foreground/60">Réduction :</span>
                  <span className="font-medium">{result.meta.ratio}%</span>
                  <span className="text-foreground/60">Qualité utilisée :</span>
                  <span>{result.meta.qualityUsed}</span>
                  {result.meta.targetSizeMb && (
                    <>
                      <span className="text-foreground/60">Taille cible :</span>
                      <span>{result.meta.targetSizeMb} Mo</span>
                    </>
                  )}
                </div>
                <div className="flex gap-3 pt-2">
                  <a
                    href={result.meta.compressedUrl || `/api/download/${result.id}`}
                    download={result.meta.originalName.replace(/\.pdf$/i, "-compressé.pdf")}
                    className="flex-1 text-center py-2 px-4 rounded-lg bg-foreground text-background font-medium text-sm hover:opacity-90 transition-opacity"
                  >
                    Télécharger
                  </a>
                  <button
                    onClick={handleReset}
                    type="button"
                    className="flex-1 py-2 px-4 rounded-lg border border-foreground/15 font-medium text-sm hover:bg-foreground/5 transition-colors"
                  >
                    Nouveau fichier
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <h2 className="font-semibold text-red-600 dark:text-red-400">
                  Erreur
                </h2>
                <p className="text-sm mt-1 text-foreground/70">
                  {result.error}
                </p>
                <button
                  onClick={handleReset}
                  type="button"
                  className="mt-3 py-2 px-4 rounded-lg border border-foreground/15 font-medium text-sm hover:bg-foreground/5 transition-colors"
                >
                  Réessayer
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
