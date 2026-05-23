/*
 * Equipment ID — OpenAI client helpers (browser-side).
 *
 * Two LLM round trips happen per analysis:
 *
 *   1. extractNameplate(image, apiKey, model)
 *      Vision call. Reads the photo of the equipment nameplate and returns
 *      structured fields (manufacturer, model, serial, plus any visibly
 *      printed manufacture date and the raw OCR text).
 *
 *   2. decodeSerial({manufacturer, serial, model, knownEntry, ...})
 *      Reasoning call. If we already have a learned format for that
 *      manufacturer, we feed that format back to the model so it decodes
 *      deterministically. Otherwise we ask the model to research the
 *      serial-number format and return both the decoded date AND the
 *      learned format so we can persist it for next time.
 *
 * All requests are made directly from the browser using the user-supplied
 * API key — no backend is involved. This is required so the site can be
 * deployed as a static bundle to Azure Static Web Apps.
 */

import type { ManufacturerEntry } from "./storage";

const OPENAI_BASE = "https://api.openai.com/v1/chat/completions";

export interface NameplateExtraction {
  manufacturer: string | null;
  modelNumber: string | null;
  serialNumber: string | null;
  printedDate: string | null;
  rawText: string;
  notes?: string;
}

export interface SerialDecoding {
  manufactureDate: string | null;
  determination: string;
  confidence: "high" | "medium" | "low";
  serialFormat: string;
  dateDecoding: string;
  modelFormat?: string;
  sources?: string[];
}

export interface AnalyzeContext {
  knownEntry?: ManufacturerEntry;
}

function stripFences(text: string): string {
  const m = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  return (m ? m[1] : text).trim();
}

function parseJson<T>(text: string): T {
  return JSON.parse(stripFences(text)) as T;
}

async function chat(opts: {
  apiKey: string;
  model: string;
  messages: unknown[];
  maxTokens?: number;
  responseJson?: boolean;
}): Promise<string> {
  const res = await fetch(OPENAI_BASE, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${opts.apiKey}`,
    },
    body: JSON.stringify({
      model: opts.model,
      messages: opts.messages,
      max_tokens: opts.maxTokens ?? 800,
      temperature: 0.1,
      ...(opts.responseJson
        ? { response_format: { type: "json_object" } }
        : {}),
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `OpenAI request failed (${res.status}): ${text || res.statusText}`,
    );
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("OpenAI returned an empty response.");
  return content;
}

export async function extractNameplate(
  imageDataUrl: string,
  apiKey: string,
  model: string,
): Promise<NameplateExtraction> {
  const system = [
    "You are a precise OCR + extraction assistant for industrial equipment nameplates.",
    "You read a single photograph of an equipment dataplate (a stamped, etched,",
    "or printed metal label) and return ONLY structured JSON.",
    "Never invent values. If a field is not legible or not present, return null.",
  ].join(" ");

  const userText = [
    "Extract the following fields from this equipment nameplate photo and",
    "return JSON with this exact shape:",
    "{",
    '  "manufacturer": string | null,        // brand or maker, e.g. "Carrier"',
    '  "modelNumber":  string | null,        // exact model/part number as printed',
    '  "serialNumber": string | null,        // exact serial as printed',
    '  "printedDate":  string | null,        // any explicitly printed date (mfg date, year of manufacture)',
    '  "rawText":      string,               // every line of text you can read, joined with " | "',
    '  "notes":        string | null         // any caveats (glare, partial text, multiple plates, etc.)',
    "}",
    "Rules:",
    "- Preserve original casing and punctuation for model/serial numbers.",
    "- Do not include UL listings, voltage, refrigerant codes, or capacity in the model number.",
    "- If the plate shows multiple model/serial pairs, choose the primary equipment plate.",
    "- Return JSON only — no prose, no code fences.",
  ].join("\n");

  const content = await chat({
    apiKey,
    model,
    responseJson: true,
    maxTokens: 900,
    messages: [
      { role: "system", content: system },
      {
        role: "user",
        content: [
          { type: "text", text: userText },
          { type: "image_url", image_url: { url: imageDataUrl, detail: "high" } },
        ],
      },
    ],
  });

  const parsed = parseJson<NameplateExtraction>(content);
  return {
    manufacturer: parsed.manufacturer ?? null,
    modelNumber: parsed.modelNumber ?? null,
    serialNumber: parsed.serialNumber ?? null,
    printedDate: parsed.printedDate ?? null,
    rawText: parsed.rawText ?? "",
    notes: parsed.notes ?? undefined,
  };
}

export async function decodeSerial(
  apiKey: string,
  model: string,
  args: {
    manufacturer: string;
    modelNumber: string | null;
    serialNumber: string;
    printedDate: string | null;
    knownEntry?: ManufacturerEntry;
  },
): Promise<SerialDecoding> {
  const { manufacturer, modelNumber, serialNumber, printedDate, knownEntry } =
    args;

  const system = [
    "You are an industrial equipment historian who decodes manufacturer",
    "serial-number formats to determine the manufacture date.",
    "You answer with rigorous reasoning and ONLY structured JSON.",
    "If you are uncertain, set confidence to 'low' and explain why.",
  ].join(" ");

  const knownBlock = knownEntry
    ? [
        "",
        "KNOWN FORMAT (already learned from a previous analysis — trust it):",
        `- serialFormat: ${knownEntry.serialFormat}`,
        `- dateDecoding: ${knownEntry.dateDecoding}`,
        knownEntry.modelFormat
          ? `- modelFormat: ${knownEntry.modelFormat}`
          : "",
        "Apply this format to decode the serial. If the serial does not match,",
        "say so in `determination` and set confidence='low'.",
      ]
        .filter(Boolean)
        .join("\n")
    : [
        "",
        "No prior format is known for this manufacturer. Use your knowledge of",
        "their published serial-numbering conventions to decode the date, and",
        "ALSO return the format you used so it can be saved for next time.",
      ].join("\n");

  const userText = [
    `Manufacturer: ${manufacturer}`,
    `Model number: ${modelNumber ?? "(unknown)"}`,
    `Serial number: ${serialNumber}`,
    `Printed date on plate: ${printedDate ?? "(none)"}`,
    knownBlock,
    "",
    "Return JSON with this exact shape:",
    "{",
    '  "manufactureDate": string | null,   // ISO-ish, e.g. "2014-07" or "Week 23 of 2018"; null if undeterminable',
    '  "determination":   string,          // 1-3 sentences explaining HOW the date was derived from the serial',
    '  "confidence":      "high" | "medium" | "low",',
    '  "serialFormat":    string,          // concise description of this manufacturer\'s serial format',
    '  "dateDecoding":    string,          // exactly which characters encode the date and how',
    '  "modelFormat":     string | null,   // optional notes on model number conventions',
    '  "sources":         string[]         // 0-3 source names or URLs you relied on',
    "}",
    "If a printed date was provided, prefer it but still return the format.",
    "Return JSON only — no prose, no code fences.",
  ].join("\n");

  const content = await chat({
    apiKey,
    model,
    responseJson: true,
    maxTokens: 700,
    messages: [
      { role: "system", content: system },
      { role: "user", content: userText },
    ],
  });

  const parsed = parseJson<SerialDecoding & { sources?: string[] }>(content);
  return {
    manufactureDate: parsed.manufactureDate ?? null,
    determination: parsed.determination ?? "",
    confidence:
      parsed.confidence === "high" || parsed.confidence === "low"
        ? parsed.confidence
        : "medium",
    serialFormat: parsed.serialFormat ?? "",
    dateDecoding: parsed.dateDecoding ?? "",
    modelFormat: parsed.modelFormat ?? undefined,
    sources: Array.isArray(parsed.sources) ? parsed.sources : undefined,
  };
}

export async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Read failed"));
    reader.readAsDataURL(file);
  });
}
