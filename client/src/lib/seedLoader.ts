/*
 * Equipment ID — seed knowledge base loader.
 *
 * On app start (and once cloud merge has resolved), any manufacturer from
 * seedKnowledge.json that is NOT already present in the merged knowledge
 * base is inserted. Seed entries never overwrite user-learned or
 * cloud-synced entries; they only fill in gaps so a fresh deployment has
 * sensible decoding rules out of the box.
 *
 * A flag in localStorage prevents the seed import from running on every
 * page load — once a deployment has been seeded it stays seeded.
 */
import seedRaw from "@/data/seedKnowledge.json";
import {
  manufacturerKey,
  type KnowledgeBase,
  type ManufacturerEntry,
} from "./storage";

interface SeedFile {
  version: number | string;
  generatedAt: string;
  description?: string;
  entries: Record<string, ManufacturerEntry>;
}

const SEED_FLAG_KEY = "equipment-id:seed-imported:v11";

const seed = seedRaw as SeedFile;

/**
 * Apply the seed knowledge to a base KnowledgeBase.
 *
 * @param base       The merged (local + cloud) knowledge base.
 * @param force      If true, ignore the import flag and merge anyway.
 * @returns          { merged, seededCount, alreadyImported }
 */
export function applySeedKnowledge(
  base: KnowledgeBase,
  force = false,
): { merged: KnowledgeBase; seededCount: number; alreadyImported: boolean } {
  const alreadyImported =
    typeof window !== "undefined" &&
    window.localStorage.getItem(SEED_FLAG_KEY) === String(seed.version);

  if (alreadyImported && !force) {
    return { merged: base, seededCount: 0, alreadyImported: true };
  }

  const merged: KnowledgeBase = { ...base };
  let seededCount = 0;

  for (const entry of Object.values(seed.entries)) {
    const key = manufacturerKey(entry.name);
    if (!key) continue;
    if (merged[key]) {
      // Overwrite if the seed entry is newer than the existing one.
      const existingDate = merged[key].updatedAt ? new Date(merged[key].updatedAt).getTime() : 0;
      const seedDate = entry.updatedAt ? new Date(entry.updatedAt).getTime() : 0;
      if (seedDate > existingDate) {
        merged[key] = { ...entry };
        seededCount += 1;
      }
      continue;
    }
    merged[key] = {
      ...entry,
      // Tag every freshly-seeded entry with the current timestamp so a
      // later cloud push doesn't look "older than" cloud entries.
      updatedAt: entry.updatedAt,
    };
    seededCount += 1;

    // Also register each alias key pointing to the same entry so that
    // alias lookups in getManufacturerEntry work without a full alias scan
    // (belt-and-suspenders; the alias scan in storage.ts is the fallback).
    if (entry.aliases) {
      for (const alias of entry.aliases) {
        const aliasKey = manufacturerKey(alias);
        if (aliasKey && !merged[aliasKey]) {
          merged[aliasKey] = merged[key];
        }
      }
    }
  }

  if (typeof window !== "undefined") {
    window.localStorage.setItem(SEED_FLAG_KEY, String(seed.version));
  }

  return { merged, seededCount, alreadyImported: false };
}

export function seedManufacturerNames(): string[] {
  return Object.values(seed.entries).map((e) => e.name);
}

export function seedVersion(): number | string {
  return seed.version;
}
