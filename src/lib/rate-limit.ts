import { createHash } from "node:crypto";

// Limiteur de débit en mémoire (Map au niveau module, fenêtre fixe).
// L'appli n'a pas de base : c'est imparfait en serverless (une Map par instance),
// une règle de pare-feu Vercel double ce garde-fou côté plateforme.

type Entry = { n: number; exp: number };
export type Limit = { key: string; max: number; windowMs: number };

const store = new Map<string, Entry>();

export const HOUR = 60 * 60 * 1000;
export const DAY = 24 * HOUR;

/** SHA-256 tronqué de l'IP cliente (premier élément de x-forwarded-for, écrasé par Vercel). */
export function ipHash(forwardedFor: string | null): string {
  const ip = (forwardedFor ?? "").split(",")[0].trim() || "inconnue";
  return createHash("sha256").update(ip).digest("hex").slice(0, 16);
}

/**
 * Vérifie toutes les limites puis incrémente les compteurs seulement si aucune
 * n'est dépassée (une requête refusée ne consomme pas le plafond global).
 */
export function takeAll(limits: Limit[]): boolean {
  const now = Date.now();
  if (store.size > 5000) {
    for (const [k, e] of store) if (e.exp <= now) store.delete(k);
  }
  for (const l of limits) {
    const e = store.get(l.key);
    if (e && e.exp > now && e.n >= l.max) return false;
  }
  for (const l of limits) {
    const e = store.get(l.key);
    if (!e || e.exp <= now) store.set(l.key, { n: 1, exp: now + l.windowMs });
    else e.n += 1;
  }
  return true;
}
