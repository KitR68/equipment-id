/*
 * Equipment ID — cloud knowledge base client.
 *
 * Talks to the managed Azure Functions API at /api/knowledge.
 * All calls degrade gracefully: if the API is unreachable (e.g. running
 * the static dev server with no Functions backend), we resolve to a
 * neutral result so the local-only knowledge base keeps working.
 *
 * Endpoints:
 *   GET    /api/knowledge                    → { entries: KnowledgeBase }
 *   POST   /api/knowledge       (entry body) → { ok, entry }
 *   DELETE /api/knowledge?manufacturer=name  → { ok }
 */
import type { KnowledgeBase, ManufacturerEntry } from "./storage";

const API_ROOT = "/api/knowledge";

export interface CloudFetchResult {
  ok: boolean;
  entries: KnowledgeBase;
  error?: string;
}

export interface CloudWriteResult {
  ok: boolean;
  error?: string;
}

export async function fetchCloudKnowledge(): Promise<CloudFetchResult> {
  try {
    const res = await fetch(API_ROOT, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      return { ok: false, entries: {}, error: `HTTP ${res.status}` };
    }
    const data = (await res.json()) as { entries?: KnowledgeBase };
    return { ok: true, entries: data.entries ?? {} };
  } catch (e) {
    return {
      ok: false,
      entries: {},
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function pushCloudEntry(
  entry: ManufacturerEntry,
): Promise<CloudWriteResult> {
  try {
    const res = await fetch(API_ROOT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: entry.name,
        serialFormat: entry.serialFormat,
        dateDecoding: entry.dateDecoding,
        modelFormat: entry.modelFormat ?? null,
        sources: entry.sources ?? [],
        usageCount: 1,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: `HTTP ${res.status}: ${text}` };
    }
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function deleteCloudEntry(
  manufacturerName: string,
): Promise<CloudWriteResult> {
  try {
    const url = `${API_ROOT}?manufacturer=${encodeURIComponent(manufacturerName)}`;
    const res = await fetch(url, { method: "DELETE" });
    if (!res.ok && res.status !== 404) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: `HTTP ${res.status}: ${text}` };
    }
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * Merge cloud entries into a local knowledge base, preferring whichever
 * record has the more recent updatedAt.
 */
export function mergeKnowledgeBases(
  local: KnowledgeBase,
  cloud: KnowledgeBase,
): KnowledgeBase {
  const out: KnowledgeBase = { ...local };
  for (const [key, cloudEntry] of Object.entries(cloud)) {
    const localEntry = out[key];
    if (!localEntry) {
      out[key] = cloudEntry;
      continue;
    }
    const cloudTime = Date.parse(cloudEntry.updatedAt) || 0;
    const localTime = Date.parse(localEntry.updatedAt) || 0;
    if (cloudTime >= localTime) {
      // Cloud wins on timestamp tie because it represents shared truth
      out[key] = {
        ...cloudEntry,
        // Preserve the higher usageCount across local + cloud
        usageCount: Math.max(
          cloudEntry.usageCount ?? 0,
          localEntry.usageCount ?? 0,
        ),
      };
    }
  }
  return out;
}
