/*
 * Equipment ID — OpenAI client helpers (browser-side).
 *
 * Two LLM round trips happen per analysis:
 *
 *   1. extractNameplate(image, apiKey, model, qrData?)
 *      Vision call. Reads the photo of the equipment nameplate and returns
 *      structured fields (manufacturer, model, serial, date code, prod date,
 *      any visibly printed manufacture date, and the raw OCR text).
 *      If a QR code was decoded client-side, its content is appended to
 *      the prompt so the model can use it to fill in or confirm fields.
 *
 *   2. decodeSerial({manufacturer, serial, model, dateCode, prodDate, knownEntry, ...})
 *      Reasoning call. If we already have a learned format for that
 *      manufacturer, we feed that format back to the model so it decodes
 *      deterministically. Otherwise we ask the model to research the
 *      serial-number format and return both the decoded date AND the
 *      learned format so we can persist it for next time.
 *      When a prodDate is present it is cross-referenced with the serial
 *      decode to produce a higher-confidence result.
 *
 * All requests are made directly from the browser using the user-supplied
 * API key — no backend is involved. This is required so the site can be
 * deployed as a static bundle to Azure Static Web Apps.
 */

import type { ManufacturerEntry } from "./storage";

const OPENAI_BASE = "https://api.openai.com/v1/chat/completions";

export interface NameplateExtraction {
  manufacturer: string | null;
  /**
   * Brief product type / description inferred from the nameplate and model number.
   * Examples: "Automatic Instantaneous Water Heater", "Central Air Conditioning Unit",
   * "Gas Furnace", "Heat Pump Water Heater", "Commercial Dryer", "Elevator Controller".
   * Null if the equipment type cannot be determined.
   */
  productDescription: string | null;
  modelNumber: string | null;
  serialNumber: string | null;
  /** Date code stamped or printed on the plate (e.g. "2305", "A14", "0519", "WK23-18"). */
  dateCode: string | null;
  /**
   * Production date field explicitly labelled on the nameplate — typically in
   * YYYYMMDD, YYYY-MM-DD, MM/DD/YYYY, or similar formats.
   * Labels looked for: PROD DATE, PRODUCTION DATE, MFG DATE, MFR DATE,
   * DATE OF MFG, DATE MFG, MFG, MANUFACTURED DATE, MANUFACTURE DATE, etc.
   */
  prodDate: string | null;
  /** Any explicitly printed manufacture date (month/year or full date). */
  printedDate: string | null;
  /** Raw decoded QR code content (if any). */
  qrData: string | null;
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
  /** Direct URL to the product manual, installation guide, or spec sheet for this model. */
  manualUrl?: string | null;
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
        "serial, date code, prod date). If the QR content contains a URL, note",
        "any product identifiers embedded in it.",
      ].join("\n")
    : "";

  const userText = [
    "Extract the following fields from this equipment nameplate photo and",
    "return JSON with this exact shape:",
    "{",
    '  "manufacturer":        string | null,   // brand or maker, e.g. "Carrier"',
    '  "productDescription":  string | null,   // brief product type/description, e.g.',
    '                                           //   "Automatic Instantaneous Water Heater",',
    '                                           //   "Central Air Conditioning Unit",',
    '                                           //   "Gas Furnace", "Heat Pump Water Heater",',
    '                                           //   "Commercial Dryer", "Elevator Controller".',
    '                                           // Infer from the nameplate text, model number,',
    '                                           // and any visible product labels. Return null if',
    '                                           // the equipment type cannot be determined.',
    '  "modelNumber":         string | null,   // exact model/part number as printed',
    '  "serialNumber":        string | null,   // exact serial as printed',
    '  "dateCode":     string | null,   // date code stamped or printed on the plate',
    '                                   // (separate from the serial; e.g. "2305", "A14", "0519", "WK23-18")',
    '                                   // return null if no distinct date code field is visible',
    '  "prodDate":     string | null,   // production / manufacture date found in a LABELLED field.',
    '                                   // Look for labels such as:',
    '                                   //   PROD DATE, PRODUCTION DATE, MFG DATE, MFR DATE,',
    '                                   //   DATE OF MFG, DATE MFG, MFG, MANUFACTURED DATE,',
    '                                   //   MANUFACTURE DATE, DATE OF MANUFACTURE, DOM, MFD',
    '                                   // Common formats: YYYYMMDD (e.g. 20230914), YYYY-MM-DD,',
    '                                   //   MM/YYYY, MM/DD/YYYY, MON YYYY (e.g. SEP 2023).',
    '                                   // Return the value EXACTLY as printed (do not reformat).',
    '                                   // Return null if no such labelled field is present.',
    '  "printedDate":  string | null,   // any other explicitly printed manufacture date not captured above',
    '  "rawText":      string,          // every line of text you can read, joined with " | "',
    '  "notes":        string | null    // any caveats (glare, partial text, multiple plates, QR content used, etc.)',
    "}",
    "Rules:",
    "- Preserve original casing and punctuation for model/serial/date code/prod date.",
    "- Do not include UL listings, voltage, refrigerant codes, or capacity in the model number.",
    "- If the plate shows multiple model/serial pairs, choose the primary equipment plate.",
    "- A date code is a short alphanumeric field that encodes the manufacture date separately",
    "  from the serial number (common on HVAC, motors, and industrial equipment).",
    "- prodDate is specifically for fields with a label like PROD DATE or MFG DATE.",
    "  If the same date appears in the serial, still capture it in prodDate if it has its own label.",
    qrBlock,
    "Return JSON only — no prose, no code fences.",
  ]
    .filter((l) => l !== undefined)
    .join("\n");

  const content = await chat({
    apiKey,
    model,
    responseJson: true,
    maxTokens: 1100,
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
    productDescription: parsed.productDescription ?? null,
    modelNumber: parsed.modelNumber ?? null,
    serialNumber: parsed.serialNumber ?? null,
    dateCode: parsed.dateCode ?? null,
    prodDate: parsed.prodDate ?? null,
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
    productDescription?: string | null;
    modelNumber: string | null;
    serialNumber: string;
    dateCode: string | null;
    prodDate: string | null;
    printedDate: string | null;
    qrData?: string | null;
    knownEntry?: ManufacturerEntry;
  },
): Promise<SerialDecoding> {
  const {
    manufacturer,
    productDescription,
    modelNumber,
    serialNumber,
    dateCode,
    prodDate,
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

  // Build a prod-date cross-reference block when a prodDate is available.
  const prodDateBlock = prodDate
    ? [
        "",
        `Production date field found on nameplate: "${prodDate}"`,
        "This is a labelled PROD DATE / MFG DATE field. It is a direct statement",
        "of the manufacture date. Use it to:",
        "  1. Cross-reference and validate the date decoded from the serial number.",
        "  2. If the serial decode agrees → set confidence='high' and mention both.",
        "  3. If the serial decode disagrees → prefer the prodDate, note the discrepancy,",
        "     and set confidence='medium'.",
        "  4. If the serial cannot be decoded → use the prodDate directly and set",
        "     confidence='high' (since it is explicitly labelled on the nameplate).",
        "Parse the prodDate value into a human-readable date for `manufactureDate`.",
        "Common formats: YYYYMMDD (20230914 = 2023-09-14), YYYY-MM-DD, MM/YYYY, etc.",
      ].join("\n")
    : "";

  const userText = [
    `Manufacturer: ${manufacturer}`,
    `Product type: ${productDescription ?? "(unknown)"}`,
    `Model number: ${modelNumber ?? "(unknown)"}`,
    `Serial number: ${serialNumber}`,
    `Date code on plate: ${dateCode ?? "(none)"}`,
    `Prod date on plate: ${prodDate ?? "(none)"}`,
    `Printed date on plate: ${printedDate ?? "(none)"}`,
    qrBlock,
    prodDateBlock,
    knownBlock,
    "",
    "Return JSON with this exact shape:",
    "{",
    '  "manufactureDate": string | null,   // ISO-ish, e.g. "2014-07" or "Week 23 of 2018"; null if undeterminable',
    '  "determination":   string,          // 1-3 sentences explaining HOW the date was derived',
    '                                      // If prodDate was used, mention it explicitly.',
    '                                      // If serial and prodDate agree, say so.',
    '  "confidence":      "high" | "medium" | "low",',
    '  "serialFormat":    string,          // concise description of this manufacturer\'s serial format',
    '  "dateDecoding":    string,          // exactly which characters encode the date and how',
    '  "modelFormat":     string | null,   // optional notes on model number conventions',
    '  "sources":         string[]         // 0-3 source names or URLs you relied on',
    '  "manualUrl":       string | null    // direct URL to the product manual, installation guide,',
    '                                      // or spec sheet for this specific model number.',
    '                                      // Use the manufacturer\'s official website when possible.',
    '                                      // Return null if no reliable URL is known.',
    "}",
    "Priority order for manufactureDate: prodDate > dateCode > serial decode > printedDate.",
    "If prodDate is present, always parse and use it as the primary date.",
    "Return JSON only — no prose, no code fences.",
  ].join("\n");

  const content = await chat({
    apiKey,
    model,
    responseJson: true,
    maxTokens: 900,
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
    manualUrl: parsed.manualUrl ?? null,
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
