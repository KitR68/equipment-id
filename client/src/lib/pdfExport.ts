/*
 * Equipment ID — PDF Export utility (client-side, jsPDF).
 *
 * Generates a clean, professional equipment identification card as a PDF.
 * Mirrors the Industrial Dossier design: navy header, stamped-label fields,
 * monospace values, and a footer with the app name + timestamp.
 */

import { jsPDF } from "jspdf";
import type { NameplateExtraction, SerialDecoding } from "./openai";

export interface PdfExportData {
  extraction: NameplateExtraction;
  decoding?: SerialDecoding;
  imageDataUrl?: string | null; // optional thumbnail
}

// ── Colours (OKLCH-approximate RGB) ─────────────────────────────────────────
const NAVY = [15, 40, 80] as const;        // deep navy (primary)
const NAVY_MID = [30, 65, 130] as const;   // mid navy (header band)
const SLATE = [55, 75, 105] as const;      // label text
const BODY = [30, 40, 55] as const;        // value text
const RULE = [200, 210, 225] as const;     // divider lines
const WHITE = [255, 255, 255] as const;
const LIGHT_BG = [245, 248, 252] as const; // card background

// ── Helpers ──────────────────────────────────────────────────────────────────
function rgb(doc: jsPDF, color: readonly [number, number, number]) {
  doc.setTextColor(color[0], color[1], color[2]);
}
function fillRgb(doc: jsPDF, color: readonly [number, number, number]) {
  doc.setFillColor(color[0], color[1], color[2]);
}
function drawRgb(doc: jsPDF, color: readonly [number, number, number]) {
  doc.setDrawColor(color[0], color[1], color[2]);
}

function truncate(text: string, maxLen: number): string {
  return text.length > maxLen ? text.slice(0, maxLen - 1) + "…" : text;
}

// ── Main export function ─────────────────────────────────────────────────────
export function exportEquipmentPdf(data: PdfExportData): void {
  const { extraction, decoding } = data;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const pageW = 210;
  const pageH = 297;
  const margin = 18;
  const contentW = pageW - margin * 2;

  // ── Background ─────────────────────────────────────────────────────────────
  fillRgb(doc, LIGHT_BG);
  doc.rect(0, 0, pageW, pageH, "F");

  // ── Header band ────────────────────────────────────────────────────────────
  fillRgb(doc, NAVY);
  doc.rect(0, 0, pageW, 42, "F");

  // Viewfinder icon (four corner ticks)
  const ix = margin;
  const iy = 10;
  const is = 14; // icon size
  const it = 3;  // tick length
  drawRgb(doc, WHITE);
  doc.setLineWidth(0.6);
  // TL
  doc.line(ix, iy + it, ix, iy);
  doc.line(ix, iy, ix + it, iy);
  // TR
  doc.line(ix + is - it, iy, ix + is, iy);
  doc.line(ix + is, iy, ix + is, iy + it);
  // BR
  doc.line(ix + is, iy + is - it, ix + is, iy + is);
  doc.line(ix + is, iy + is, ix + is - it, iy + is);
  // BL
  doc.line(ix + it, iy + is, ix, iy + is);
  doc.line(ix, iy + is, ix, iy + is - it);
  // centre dot
  fillRgb(doc, WHITE);
  doc.circle(ix + is / 2, iy + is / 2, 1.2, "F");

  // Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  rgb(doc, WHITE);
  doc.text("EQUIPMENT ID", margin + is + 5, 20);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(180, 200, 230);
  doc.text("AI-POWERED EQUIPMENT IDENTIFICATION", margin + is + 5, 27);

  // Timestamp (top-right)
  const now = new Date().toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  doc.setFontSize(7);
  doc.setTextColor(160, 185, 220);
  doc.text(now, pageW - margin, 20, { align: "right" });

  // ── Card body ──────────────────────────────────────────────────────────────
  const cardTop = 50;
  const cardPad = 10;
  const cardInnerW = contentW - cardPad * 2;
  let y = cardTop + cardPad + 6;

  // Card shadow (faked with a slightly offset rect)
  fillRgb(doc, [220, 228, 240]);
  doc.roundedRect(margin + 1, cardTop + 1, contentW, 210, 3, 3, "F");

  // Card background
  fillRgb(doc, WHITE);
  doc.roundedRect(margin, cardTop, contentW, 210, 3, 3, "F");

  // Card top accent bar
  fillRgb(doc, NAVY_MID);
  doc.roundedRect(margin, cardTop, contentW, 6, 3, 3, "F");
  doc.rect(margin, cardTop + 3, contentW, 3, "F"); // flatten bottom corners

  // ── Section title ──────────────────────────────────────────────────────────
  y += 4;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  rgb(doc, SLATE);
  doc.text("IDENTIFICATION RESULTS", margin + cardPad, y);

  // Confidence chip
  if (decoding?.confidence) {
    const chipColors: Record<string, readonly [number, number, number]> = {
      high: [220, 242, 220],
      medium: [255, 243, 205],
      low: [255, 225, 220],
    };
    const chipText: Record<string, string> = {
      high: "HIGH CONFIDENCE",
      medium: "MEDIUM CONFIDENCE",
      low: "LOW CONFIDENCE",
    };
    const chipBg = chipColors[decoding.confidence] ?? chipColors.medium;
    const chipLabel = chipText[decoding.confidence] ?? "MEDIUM CONFIDENCE";
    const chipW = 36;
    const chipX = margin + contentW - cardPad - chipW;
    fillRgb(doc, chipBg);
    doc.roundedRect(chipX, y - 4, chipW, 5.5, 1, 1, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(5.5);
    rgb(doc, BODY);
    doc.text(chipLabel, chipX + chipW / 2, y - 0.5, { align: "center" });
  }

  y += 8;

  // ── Field renderer ─────────────────────────────────────────────────────────
  const fields: Array<{ label: string; value: string | null | undefined; mono?: boolean }> = [
    { label: "MANUFACTURER", value: extraction.manufacturer },
    { label: "PRODUCT DESCRIPTION", value: extraction.productDescription },
    { label: "MODEL NUMBER", value: extraction.modelNumber, mono: true },
    { label: "SERIAL NUMBER", value: extraction.serialNumber, mono: true },
    { label: "DATE CODE", value: extraction.dateCode, mono: true },
    { label: "PROD DATE", value: extraction.prodDate, mono: true },
    { label: "MANUFACTURE DATE", value: decoding?.manufactureDate ?? extraction.printedDate },
  ];

  for (const field of fields) {
    if (!field.value) continue;

    // Label
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    rgb(doc, SLATE);
    doc.text(field.label, margin + cardPad, y);

    // Value
    doc.setFont(field.mono ? "courier" : "helvetica", field.mono ? "normal" : "bold");
    doc.setFontSize(10);
    rgb(doc, BODY);
    doc.text(truncate(field.value, 60), margin + cardPad, y + 5.5);

    // Divider
    y += 14;
    drawRgb(doc, RULE);
    doc.setLineWidth(0.2);
    doc.line(margin + cardPad, y - 2, margin + cardPad + cardInnerW, y - 2);
  }

  // ── Determination block ────────────────────────────────────────────────────
  if (decoding?.determination) {
    y += 2;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    rgb(doc, SLATE);
    doc.text("DETERMINATION", margin + cardPad, y);

    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    rgb(doc, BODY);
    const lines = doc.splitTextToSize(decoding.determination, cardInnerW);
    doc.text(lines.slice(0, 4), margin + cardPad, y); // max 4 lines
    y += lines.slice(0, 4).length * 4.5;
  }

  // ── Manual URL block ───────────────────────────────────────────────────────
  if (decoding?.manualUrl) {
    y += 4;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    rgb(doc, SLATE);
    doc.text("PRODUCT MANUAL / DOCUMENTATION", margin + cardPad, y);

    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(30, 100, 200);
    doc.textWithLink(
      truncate(decoding.manualUrl, 80),
      margin + cardPad,
      y,
      { url: decoding.manualUrl },
    );
    y += 6;
  }

  // ── QR data block ──────────────────────────────────────────────────────────
  if (extraction.qrData) {
    y += 4;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    rgb(doc, SLATE);
    doc.text("QR CODE DATA", margin + cardPad, y);

    y += 5;
    doc.setFont("courier", "normal");
    doc.setFontSize(7.5);
    rgb(doc, BODY);
    const qrLines = doc.splitTextToSize(truncate(extraction.qrData, 200), cardInnerW);
    doc.text(qrLines.slice(0, 3), margin + cardPad, y);
    y += qrLines.slice(0, 3).length * 4;
  }

  // ── Sources ────────────────────────────────────────────────────────────────
  if (decoding?.sources && decoding.sources.length > 0) {
    y += 6;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6);
    rgb(doc, SLATE);
    doc.text("SOURCES", margin + cardPad, y);
    y += 4;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    rgb(doc, [100, 120, 150]);
    for (const src of decoding.sources.slice(0, 3)) {
      doc.text("· " + truncate(src, 80), margin + cardPad, y);
      y += 4;
    }
  }

  // ── Footer ─────────────────────────────────────────────────────────────────
  fillRgb(doc, NAVY);
  doc.rect(0, pageH - 18, pageW, 18, "F");

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(160, 185, 220);
  doc.text("EQUIPMENT ID  ·  STATIC CLIENT  ·  OPENAI VISION", margin, pageH - 8);
  doc.text("Your API key never leaves your browser.", pageW - margin, pageH - 8, { align: "right" });

  // ── Save ───────────────────────────────────────────────────────────────────
  const mfr = (extraction.manufacturer ?? "equipment").replace(/[^a-z0-9]/gi, "_").toLowerCase();
  const serial = (extraction.serialNumber ?? "").replace(/[^a-z0-9]/gi, "").toLowerCase();
  const filename = `equipment-id_${mfr}${serial ? "_" + serial : ""}.pdf`;
  doc.save(filename);
}
