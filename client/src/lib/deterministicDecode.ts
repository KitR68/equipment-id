/**
 * Equipment ID — Deterministic serial number decoder.
 *
 * For manufacturers with well-known, simple serial number date formats,
 * this module decodes the manufacture date using pure code logic — no AI.
 * This eliminates the inconsistency of LLM-based interpretation.
 *
 * When a manufacturer has a registered decoder here, it takes priority
 * over the LLM decoding step.
 */

import type { SerialDecoding } from "./openai";

const MONTHS = [
  "", "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

interface DecoderResult {
  manufactureDate: string;
  determination: string;
  confidence: "high" | "medium" | "low";
  serialFormat: string;
  dateDecoding: string;
}

type DecoderFn = (serial: string, dateCode?: string | null) => DecoderResult | null;

/**
 * Power Flame Inc — Serial format: MMYY#####
 * First 2 digits = month (01-12), next 2 digits = year (two-digit),
 * remaining digits = production sequence.
 */
function decodePowerFlame(serial: string): DecoderResult | null {
  // Must be at least 5 digits (MMYY + at least 1 sequence digit)
  const cleaned = serial.replace(/[\s-]/g, "");
  if (!/^\d{5,}$/.test(cleaned)) return null;

  const mm = parseInt(cleaned.substring(0, 2), 10);
  const yy = parseInt(cleaned.substring(2, 4), 10);

  if (mm < 1 || mm > 12) return null;

  // Convert 2-digit year: 00-49 → 2000-2049, 50-99 → 1950-1999
  const fullYear = yy < 50 ? 2000 + yy : 1900 + yy;

  const monthName = MONTHS[mm];
  const manufactureDate = `${fullYear}-${String(mm).padStart(2, "0")}`;

  return {
    manufactureDate,
    determination: `Serial ${serial}: first two digits "${String(mm).padStart(2, "0")}" = ${monthName}, next two digits "${String(yy).padStart(2, "0")}" = ${fullYear}. Manufacture date: ${monthName} ${fullYear}.`,
    confidence: "high",
    serialFormat: `MMYY##### — First 2 digits = month (01-12), digits 3-4 = year (two-digit), remaining = production sequence.`,
    dateDecoding: `Digits 1-2 = month, digits 3-4 = year. Example: 020516266 → 02(Feb) + 05(2005) + 16266(seq) = February 2005.`,
  };
}

/**
 * Vissani / Midea — Date code format: WWYYYY_XXXXXXX
 * First 2 digits = week (01-52), next 4 digits = year,
 * underscore separator, remaining = production sequence.
 */
function decodeVissani(_serial: string, dateCode?: string | null): DecoderResult | null {
  const code = dateCode || _serial;
  if (!code) return null;

  // Match pattern: WW YYYY _ sequence
  const match = code.match(/^(\d{2})(\d{4})[_-](\d+)$/);
  if (!match) return null;

  const ww = parseInt(match[1], 10);
  const yyyy = parseInt(match[2], 10);

  if (ww < 1 || ww > 53) return null;
  if (yyyy < 1990 || yyyy > 2099) return null;

  // Approximate the month from the week number
  const approxMonth = Math.ceil(ww * 12 / 52);
  const monthName = MONTHS[approxMonth] || "";

  const manufactureDate = `Week ${ww} of ${yyyy}`;

  return {
    manufactureDate,
    determination: `Date code ${code}: first two digits "${String(ww).padStart(2, "0")}" = week ${ww}, next four digits "${yyyy}" = year ${yyyy}. This corresponds to approximately ${monthName} ${yyyy}.`,
    confidence: "high",
    serialFormat: `WWYYYY_XXXXXXX — First 2 digits = week (01-52), next 4 digits = four-digit year, underscore, then production sequence.`,
    dateDecoding: `Digits 1-2 = week number, digits 3-6 = year. Example: 402024_2009375 → week 40 of 2024 (late September/early October 2024).`,
  };
}

/**
 * Registry of deterministic decoders.
 * Each entry has a list of keywords — if ALL keywords in any entry
 * are found in the normalized manufacturer name, that decoder is used.
 */
const DECODER_RULES: Array<{ keywords: string[]; decoder: DecoderFn }> = [
  { keywords: ["power", "flame"], decoder: decodePowerFlame },
  { keywords: ["vissani"], decoder: decodeVissani },
  { keywords: ["midea"], decoder: decodeVissani },
];

/**
 * Normalize a manufacturer name for matching: lowercase, strip punctuation,
 * collapse whitespace.
 */
function normalizeForMatch(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "") // remove all punctuation
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Attempt a deterministic (code-based) decode for a given manufacturer.
 * Returns a full SerialDecoding if successful, or null if no decoder
 * is registered or the serial doesn't match the expected pattern.
 */
export function deterministicDecode(
  manufacturer: string,
  serialNumber: string,
  dateCode?: string | null,
): SerialDecoding | null {
  const normalized = normalizeForMatch(manufacturer);

  // Find a matching decoder by checking if all keywords appear in the name
  let matchedDecoder: DecoderFn | null = null;
  for (const rule of DECODER_RULES) {
    if (rule.keywords.every((kw) => normalized.includes(kw))) {
      matchedDecoder = rule.decoder;
      break;
    }
  }

  if (!matchedDecoder) return null;

  const result = matchedDecoder(serialNumber, dateCode);
  if (!result) return null;

  return {
    ...result,
    modelFormat: undefined,
    sources: ["Deterministic decoder (programmatic)"],
    manualUrl: null,
  };
}
