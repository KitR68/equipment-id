/*
 * Equipment ID — OpenAI client helpers (browser-side).
 *
 * Two LLM round trips happen per analysis:
 *
 *   1. extractNameplate(image, apiKey, model, qrData?)
 *      Vision call. Reads the photo of the equipment nameplate and returns
 *      structured fields (manufacturer, model, serial, date code, any
 *      visibly printed manufacture date, and the raw OCR text).
 *      If a QR code was decoded client-side, its content is appended to
 *      the prompt so the model can use it to fill in or confirm fields.
 *
 *   2. decodeSerial({manufacturer, serial, model, dateCode, knownEntry, ...})
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
  dateCode: string | null;       // date code stamped on the plate (e.g. "2305", "A14", "0519")
  printedDate: string | null;    // explicitly printed manufacture date
  qrData: string | null;         // raw decoded QR code content (if any)
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
      max_tokens: opts.maxTokens ?? 900,
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
  qrData?: string | null,
): Promise<NameplateExtraction> {
  const system = [
    "You are a precise OCR + extraction assistant for industrial equipment nameplates.",
    "You read a single photograph of an equipment dataplate (a stamped, etched,",
    "or printed metal label) and return ONLY structured JSON.",
    "Never invent values. If a field is not legible or not present, return null.",
  ].join(" ");

  const qrBlock = qrData
    ? [
        "",
        `A QR code was detected in this image. Its decoded content is:`,
        `  "${qrData}"`,
        "Use this data to help fill in or confirm fields (manufacturer, model,",
        "serial, date code). If the QR content contains a URL, note any product",
        "identifiers embedded in it.",
      ].join("\n")
    : "";

  const userText = [
    "Extract the following fields from this equipment nameplate photo and",
    "return JSON with this exact shape:",
    "{",
    '  "manufacturer": string | null,   // brand or maker, e.g. "Carrier"',
    '  "modelNumber":  string | null,   // exact model/part number as printed',
    '  "serialNumber": string | null,   // exact serial as printed',
    '  "dateCode":     string | null,   // date code stamped or printed on the plate',
    '                                   // (separate from the serial; e.g. "2305", "A14", "0519", "WK23-18")',
    '                                   // return null if no distinct date code field is visible',
    '  "printedDate":  string | null,   // any explicitly printed manufacture date (month/year or full date)',
    '  "rawText":      string,          // every line of text you can read, joined with " | "',
    '  "notes":        string | null    // any caveats (glare, partial text, multiple plates, QR content used, etc.)',
    "}",
    "Rules:",
    "- Preserve original casing and punctuation for model/serial/date code.",
    "- Do not include UL listings, voltage, refrigerant codes, or capacity in the model number.",
    "- If the plate shows multiple model/serial pairs, choose the primary equipment plate.",
    "- A date code is a short alphanumeric field that encodes the manufacture date separately",
    "  from the serial number (common on HVAC, motors, and industrial equipment).",
    qrBlock,
    "Return JSON only — no prose, no code fences.",
  ]
    .filter((l) => l !== undefined)
    .join("\n");

  const content = await chat({
    apiKey,
    model,
    responseJson: true,
    maxTokens: 1000,
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
    dateCode: parsed.dateCode ?? null,
    printedDate: parsed.printedDate ?? null,
    qrData: qrData ?? null,
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
    dateCode: string | null;
    printedDate: string | null;
    qrData?: string | null;
    knownEntry?: ManufacturerEntry;
  },
): Promise<SerialDecoding> {
  const {
    manufacturer,
    modelNumber,
    serialNumber,
    dateCode,
    printedDate,
    qrData,
    knownEntry,
  } = args;

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

  const qrBlock = qrData
    ? `\nQR code content from the nameplate image: "${qrData}"\nUse this to confirm or supplement the manufacture date if it contains date information.`
    : "";

  const userText = [
    `Manufacturer: ${manufacturer}`,
    `Model number: ${modelNumber ?? "(unknown)"}`,
    `Serial number: ${serialNumber}`,
    `Date code on plate: ${dateCode ?? "(none)"}`,
    `Printed date on plate: ${printedDate ?? "(none)"}`,
    qrBlock,
    knownBlock,
    "",
    "Return JSON with this exact shape:",
    "{",
    '  "manufactureDate": string | null,   // ISO-ish, e.g. "2014-07" or "Week 23 of 2018"; null if undeterminable',
    '  "determination":   string,          // 1-3 sentences explaining HOW the date was derived',
    '  "confidence":      "high" | "medium" | "low",',
    '  "serialFormat":    string,          // concise description of this manufacturer\'s serial format',
    '  "dateDecoding":    string,          // exactly which characters encode the date and how',
    '  "modelFormat":     string | null,   // optional notes on model number conventions',
    '  "sources":         string[]         // 0-3 source names or URLs you relied on',
    "}",
    "If a date code or printed date was provided, prefer it but still return the serial format.",
    "Return JSON only — no prose, no code fences.",
  ].join("\n");

  const content = await chat({
    apiKey,
    model,
    responseJson: true,
    maxTokens: 800,
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
