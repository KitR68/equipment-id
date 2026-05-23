/*
 * Equipment ID — Correct & Teach panel.
 *
 * Industrial Dossier styling: same stamped-card aesthetic as FieldCard.
 * Appears below the Manufacture Date result card. A "Teach this pattern"
 * toggle expands an inline form where the user can enter the correct date
 * and describe the decoding rule. Saving writes to localStorage and
 * fire-and-forgets a POST to /api/knowledge.
 *
 * Props:
 *   manufacturer   — name of the manufacturer from the extraction result
 *   currentEntry   — existing KB entry for this manufacturer (may be undefined)
 *   cloudStatus    — "online" | "offline" | "checking" — controls the sync badge
 *   onSave         — called with the updated ManufacturerEntry after saving
 */
import { useState } from "react";
import { GraduationCap, ChevronDown, ChevronUp, Check, Cloud, CloudOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ManufacturerEntry } from "@/lib/storage";

interface Props {
  manufacturer: string;
  currentEntry?: ManufacturerEntry;
  cloudStatus: "checking" | "online" | "offline";
  onSave: (entry: ManufacturerEntry) => void;
}

export function CorrectAndTeach({
  manufacturer,
  currentEntry,
  cloudStatus,
  onSave,
}: Props) {
  const [open, setOpen] = useState(false);
  const [correctDate, setCorrectDate] = useState(
    currentEntry?.dateDecoding ? "" : "",
  );
  const [decodingRule, setDecodingRule] = useState(
    currentEntry?.dateDecoding ?? "",
  );
  const [serialFormat, setSerialFormat] = useState(
    currentEntry?.serialFormat ?? "",
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleOpen = () => {
    // Pre-fill from current KB entry if available
    setDecodingRule(currentEntry?.dateDecoding ?? "");
    setSerialFormat(currentEntry?.serialFormat ?? "");
    setCorrectDate("");
    setSaved(false);
    setOpen(true);
  };

  const handleSave = async () => {
    if (!decodingRule.trim()) return;
    setSaving(true);
    try {
      const entry: ManufacturerEntry = {
        name: manufacturer,
        serialFormat: serialFormat.trim() || currentEntry?.serialFormat || "",
        dateDecoding: decodingRule.trim(),
        modelFormat: currentEntry?.modelFormat,
        sources: currentEntry?.sources,
        updatedAt: new Date().toISOString(),
        usageCount: (currentEntry?.usageCount ?? 0) + 1,
      };
      onSave(entry);
      setSaved(true);
      // Collapse after a short delay so the user sees the confirmation tick
      setTimeout(() => setOpen(false), 1800);
    } finally {
      setSaving(false);
    }
  };

  const canSave = decodingRule.trim().length > 0 && !saving;

  return (
    <div
      className="anim-rise border border-border bg-card"
      style={{ animationDelay: "300ms" }}
    >
      {/* ── Toggle row ──────────────────────────────────────────────────── */}
      <button
        type="button"
        onClick={open ? () => setOpen(false) : handleOpen}
        className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-accent/40 transition-colors duration-150 group"
        aria-expanded={open}
      >
        <div className="flex items-center gap-2.5">
          <GraduationCap
            size={14}
            className="text-primary shrink-0"
          />
          <span className="label-stamp text-primary">
            Correct &amp; Teach
          </span>
          <span className="text-xs text-muted-foreground">
            — fix the date or teach the decoding rule for future lookups
          </span>
        </div>
        <span className="text-muted-foreground group-hover:text-primary transition-colors">
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </span>
      </button>

      {/* ── Expanded form ───────────────────────────────────────────────── */}
      {open && (
        <div className="border-t border-border px-5 py-5 space-y-5">
          {/* Context line */}
          <div className="flex items-start gap-3 bg-secondary/40 border border-border px-4 py-3">
            <div className="flex-1 min-w-0">
              <p className="label-stamp text-primary">
                Teaching pattern for: {manufacturer}
              </p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                Your correction will be saved to the knowledge base and used
                every time this manufacturer&apos;s serial numbers are decoded.
                {cloudStatus === "online"
                  ? " It will also be synced to the shared cloud knowledge base."
                  : " The cloud knowledge base is currently unreachable; the rule will be saved locally and synced when available."}
              </p>
            </div>
            <span className="shrink-0 mt-0.5">
              {cloudStatus === "online" ? (
                <Cloud size={13} className="text-primary" />
              ) : cloudStatus === "checking" ? (
                <Loader2 size={13} className="text-muted-foreground animate-spin" />
              ) : (
                <CloudOff size={13} className="text-muted-foreground" />
              )}
            </span>
          </div>

          {/* Correct date */}
          <div className="space-y-1.5">
            <Label htmlFor="ct-correct-date" className="label-stamp">
              Correct Manufacture Date
            </Label>
            <Input
              id="ct-correct-date"
              value={correctDate}
              onChange={(e) => setCorrectDate(e.target.value)}
              placeholder="e.g. March 2019, 2019-03, Q1 2019"
              className="font-mono"
              spellCheck={false}
            />
            <p className="text-xs text-muted-foreground">
              Optional — enter the correct date if the AI got it wrong. This
              helps you keep a record but the decoding rule below is what the
              app learns.
            </p>
          </div>

          {/* Serial format */}
          <div className="space-y-1.5">
            <Label htmlFor="ct-serial-format" className="label-stamp">
              Serial Number Format
            </Label>
            <Input
              id="ct-serial-format"
              value={serialFormat}
              onChange={(e) => setSerialFormat(e.target.value)}
              placeholder="e.g. YYWWSSSS — year, week, sequence"
              className="font-mono"
              spellCheck={false}
            />
            <p className="text-xs text-muted-foreground">
              Describe the overall structure of the serial number (optional but
              helpful).
            </p>
          </div>

          {/* Decoding rule — required */}
          <div className="space-y-1.5">
            <Label htmlFor="ct-decoding-rule" className="label-stamp">
              Date Decoding Rule{" "}
              <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="ct-decoding-rule"
              value={decodingRule}
              onChange={(e) => setDecodingRule(e.target.value)}
              placeholder={
                "e.g. First 4 digits = year (YYYY), next 2 digits = month (MM), " +
                "remaining digits = sequential unit number. " +
                "Serial 201903042 → manufactured March 2019."
              }
              className="font-mono text-sm min-h-[96px] resize-y"
              spellCheck={false}
            />
            <p className="text-xs text-muted-foreground">
              Be as specific as possible. The AI will use this rule verbatim
              the next time it decodes a serial from {manufacturer}.
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between gap-4 pt-1">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="label-stamp text-muted-foreground hover:text-primary transition-colors"
            >
              Cancel
            </button>
            <Button
              onClick={handleSave}
              disabled={!canSave}
              className="bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[0.98] transition-transform duration-150 rounded-sm px-5 h-9 gap-2"
            >
              {saved ? (
                <>
                  <Check size={14} />
                  Saved &amp; Synced
                </>
              ) : saving ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Saving…
                </>
              ) : (
                <>
                  <GraduationCap size={14} />
                  Teach this pattern
                </>
              )}
            </Button>
          </div>

          {saved && (
            <p className="text-xs text-muted-foreground">
              ✓ Rule saved. The next analysis of a{" "}
              <span className="font-serif text-primary">{manufacturer}</span>{" "}
              serial number will use your correction.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
