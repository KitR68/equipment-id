/*
 * Equipment ID — local persistence layer.
 *
 * Two stores live in localStorage:
 *  1. SETTINGS_KEY — the user's OpenAI API key + preferred model.
 *  2. KB_KEY       — the learning knowledge base of manufacturer
 *                    serial-number formats. Whenever the app encounters a
 *                    manufacturer it has seen before, the stored format is
 *                    fed back into the LLM so it can decode the serial
 *                    deterministically. New manufacturers are researched
 *                    once and saved for next time.
 *
 * Design note: keep this file tiny and dependency-free so it compiles into
 * the static bundle for Azure Static Web Apps.
 */

export const SETTINGS_KEY = "equipment-id:settings:v1";
export const KB_KEY = "equipment-id:knowledge-base:v1";

export interface AppSettings {
  openaiApiKey: string;
  model: string; // e.g. "gpt-4o" — vision-capable
}

export const defaultSettings: AppSettings = {
  openaiApiKey: "",
  model: "gpt-4o",
};

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...defaultSettings };
    const parsed = JSON.parse(raw);
    return { ...defaultSettings, ...parsed };
  } catch {
    return { ...defaultSettings };
  }
}

export function saveSettings(s: AppSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

/** A single learned manufacturer entry. */
export interface ManufacturerEntry {
  /** Canonical manufacturer name, lowercased for keying. */
  name: string;
  /** Human-readable serial-number format description. */
  serialFormat: string;
  /** How the manufacture date is encoded in the serial. */
  dateDecoding: string;
  /** Notes on model-number conventions, optional. */
  modelFormat?: string;
  /** Sources / citations the LLM produced when it researched the format. */
  sources?: string[];
  /** ISO timestamp of the most recent update. */
  updatedAt: string;
  /** Number of times this entry has been used to decode a serial. */
  usageCount: number;
  /**
   * Optional list of alternate manufacturer names that should resolve to
   * this entry (e.g. brand variants, legacy names, abbreviations).
   * Each alias is stored as a normalised key (same transform as manufacturerKey).
   */
  aliases?: string[];
}

export type KnowledgeBase = Record<string, ManufacturerEntry>;

export function loadKnowledgeBase(): KnowledgeBase {
  try {
    const raw = localStorage.getItem(KB_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as KnowledgeBase;
  } catch {
    return {};
  }
}

export function saveKnowledgeBase(kb: KnowledgeBase) {
  localStorage.setItem(KB_KEY, JSON.stringify(kb));
}

export function manufacturerKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export function getManufacturerEntry(
  kb: KnowledgeBase,
  name: string,
): ManufacturerEntry | undefined {
  const key = manufacturerKey(name);
  if (!key) return undefined;
  // Direct key match
  if (kb[key]) return kb[key];
  // Alias scan: check every entry's aliases array for a match
  for (const entry of Object.values(kb)) {
    if (entry.aliases) {
      for (const alias of entry.aliases) {
        if (manufacturerKey(alias) === key) return entry;
      }
    }
  }
  return undefined;
}

export function upsertManufacturerEntry(
  kb: KnowledgeBase,
  entry: Omit<ManufacturerEntry, "updatedAt" | "usageCount"> &
    Partial<Pick<ManufacturerEntry, "usageCount">>,
): KnowledgeBase {
  const key = manufacturerKey(entry.name);
  if (!key) return kb;
  const existing = kb[key];
  const merged: ManufacturerEntry = {
    name: entry.name.trim(),
    serialFormat: entry.serialFormat,
    dateDecoding: entry.dateDecoding,
    modelFormat: entry.modelFormat ?? existing?.modelFormat,
    sources: entry.sources ?? existing?.sources,
    updatedAt: new Date().toISOString(),
    usageCount:
      (existing?.usageCount ?? 0) + (entry.usageCount ?? 1),
  };
  return { ...kb, [key]: merged };
}

export function deleteManufacturerEntry(
  kb: KnowledgeBase,
  name: string,
): KnowledgeBase {
  const key = manufacturerKey(name);
  if (!kb[key]) return kb;
  const next = { ...kb };
  delete next[key];
  return next;
}
