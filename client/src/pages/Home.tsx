/*
 * Equipment ID — Home page.
 *
 * Industrial Dossier layout: nameplate header, viewfinder upload zone,
 * navy "Analyze" button, then four stamped field cards for the results.
 * All inference happens in the browser using the user-provided OpenAI key.
 *
 * Flow:
 *   1. User drops/picks a JPG or PNG of a nameplate.
 *   2. Click Analyze → vision call extracts manufacturer/model/serial/etc.
 *   3. If we have a learned format for that manufacturer in localStorage,
 *      it is fed back to the LLM to decode the serial deterministically.
 *      Otherwise, the LLM researches the format and we save it.
 *   4. Four field cards animate in with stamped labels + confidence chip.
 */
import { useEffect, useMemo, useState } from "react";
import { Loader2, Settings as SettingsIcon, ScanSearch, AlertTriangle, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { UploadZone } from "@/components/UploadZone";
import { FieldCard } from "@/components/FieldCard";
import { SettingsDialog } from "@/components/SettingsDialog";
import {
  loadKnowledgeBase,
  loadSettings,
  saveKnowledgeBase,
  saveSettings,
  getManufacturerEntry,
  upsertManufacturerEntry,
  type AppSettings,
  type KnowledgeBase,
} from "@/lib/storage";
import {
  decodeSerial,
  extractNameplate,
  fileToDataUrl,
  type NameplateExtraction,
  type SerialDecoding,
} from "@/lib/openai";

interface AnalysisResult {
  extraction: NameplateExtraction;
  decoding?: SerialDecoding;
  usedKnownFormat: boolean;
  finishedAt: string;
}

export default function Home() {
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [kb, setKb] = useState<KnowledgeBase>(() => loadKnowledgeBase());
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);

  // Manage object URL lifecycle for the preview thumbnail.
  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Open settings on first load if no API key is present.
  useEffect(() => {
    if (!settings.openaiApiKey) {
      setSettingsOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFileSelected = (f: File | null) => {
    setFile(f);
    setResult(null);
    setError(null);
  };

  const handleSettingsSave = (next: AppSettings) => {
    setSettings(next);
    saveSettings(next);
    setKb(loadKnowledgeBase());
  };

  const learnedCount = useMemo(() => Object.keys(kb).length, [kb]);

  const handleAnalyze = async () => {
    if (!file) return;
    if (!settings.openaiApiKey) {
      toast.error("Add your OpenAI API key in settings first.");
      setSettingsOpen(true);
      return;
    }
    setAnalyzing(true);
    setError(null);
    setResult(null);
    try {
      setProgress("Reading nameplate text…");
      const dataUrl = await fileToDataUrl(file);
      const extraction = await extractNameplate(
        dataUrl,
        settings.openaiApiKey,
        settings.model,
      );

      let decoding: SerialDecoding | undefined;
      let usedKnownFormat = false;

      if (extraction.manufacturer && extraction.serialNumber) {
        const knownEntry = getManufacturerEntry(kb, extraction.manufacturer);
        usedKnownFormat = Boolean(knownEntry);
        setProgress(
          knownEntry
            ? `Decoding serial with learned ${extraction.manufacturer} format…`
            : `Researching ${extraction.manufacturer} serial format…`,
        );

        decoding = await decodeSerial(
          settings.openaiApiKey,
          settings.model,
          {
            manufacturer: extraction.manufacturer,
            modelNumber: extraction.modelNumber,
            serialNumber: extraction.serialNumber,
            printedDate: extraction.printedDate,
            knownEntry,
          },
        );

        // Persist what we learned (or reinforce what we already knew).
        if (decoding.serialFormat) {
          const nextKb = upsertManufacturerEntry(kb, {
            name: extraction.manufacturer,
            serialFormat: decoding.serialFormat,
            dateDecoding: decoding.dateDecoding,
            modelFormat: decoding.modelFormat,
            sources: decoding.sources,
          });
          setKb(nextKb);
          saveKnowledgeBase(nextKb);
        }
      }

      setResult({
        extraction,
        decoding,
        usedKnownFormat,
        finishedAt: new Date().toISOString(),
      });
      setProgress("");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      toast.error("Analysis failed", { description: msg });
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* ── Nameplate header ──────────────────────────────────────────── */}
      <header className="relative border-b border-border bg-background/70 backdrop-blur-sm">
        <div className="mx-auto max-w-3xl px-6 py-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative w-10 h-10 border border-primary/60 bg-card flex items-center justify-center">
              {/* Four "screw heads" — pure CSS rivets */}
              <span className="absolute top-0.5 left-0.5 w-1 h-1 rounded-full bg-primary/70" />
              <span className="absolute top-0.5 right-0.5 w-1 h-1 rounded-full bg-primary/70" />
              <span className="absolute bottom-0.5 left-0.5 w-1 h-1 rounded-full bg-primary/70" />
              <span className="absolute bottom-0.5 right-0.5 w-1 h-1 rounded-full bg-primary/70" />
              <ScanSearch size={16} className="text-primary" />
            </div>
            <div>
              <h1 className="font-serif text-2xl sm:text-3xl text-primary leading-none tracking-tight">
                Equipment ID
              </h1>
              <p className="label-stamp mt-1.5">
                AI-Powered Equipment Identification
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="inline-flex items-center gap-2 label-stamp text-muted-foreground hover:text-primary transition-colors"
            aria-label="Open settings"
          >
            <SettingsIcon size={14} />
            <span className="hidden sm:inline">Settings</span>
          </button>
        </div>
      </header>

      {/* ── Main column ───────────────────────────────────────────────── */}
      <main className="flex-1">
        <div className="mx-auto max-w-3xl px-6 py-10 sm:py-14">
          {/* Intro line */}
          <p className="text-muted-foreground text-base leading-relaxed mb-8 max-w-2xl">
            Upload a clear photo of an equipment dataplate. The system reads
            the printed text, identifies the manufacturer, model, and serial
            number, and decodes the manufacture date from the serial-number
            format — learning new manufacturer formats as it goes.
          </p>

          {/* Upload + Analyze */}
          <section className="space-y-5">
            <UploadZone
              file={file}
              previewUrl={previewUrl}
              onFileSelected={handleFileSelected}
              disabled={analyzing}
            />

            <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
              <div className="flex items-center gap-2 label-stamp text-muted-foreground">
                <BookOpen size={12} />
                {learnedCount === 0
                  ? "Knowledge base empty"
                  : `${learnedCount} manufacturer${learnedCount === 1 ? "" : "s"} learned`}
              </div>
              <Button
                onClick={handleAnalyze}
                disabled={!file || analyzing}
                className="bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[0.98] transition-transform duration-150 px-6 h-11 rounded-sm font-medium tracking-wide"
              >
                {analyzing ? (
                  <>
                    <Loader2 className="animate-spin mr-2" size={16} />
                    Analyzing…
                  </>
                ) : (
                  "Analyze"
                )}
              </Button>
            </div>

            {analyzing && progress && (
              <p className="label-stamp text-muted-foreground anim-rise">
                {progress}
              </p>
            )}

            {error && (
              <div className="border border-destructive/40 bg-destructive/5 px-4 py-3 flex items-start gap-3 anim-rise">
                <AlertTriangle
                  size={16}
                  className="text-destructive mt-0.5 shrink-0"
                />
                <div className="text-sm text-destructive">{error}</div>
              </div>
            )}
          </section>

          {/* Results */}
          {result && (
            <section className="mt-12 space-y-4">
              <header className="flex items-end justify-between border-b border-border pb-3">
                <div>
                  <div className="label-stamp">Identification</div>
                  <h2 className="font-serif text-xl text-primary mt-1">
                    Extracted Fields
                  </h2>
                </div>
                {result.usedKnownFormat && (
                  <span className="chip-confidence" data-level="high">
                    Known format · KB hit
                  </span>
                )}
              </header>

              <FieldCard
                label="Manufacturer"
                value={result.extraction.manufacturer}
                delayMs={0}
              />
              <FieldCard
                label="Model Number"
                value={result.extraction.modelNumber}
                delayMs={60}
              />
              <FieldCard
                label="Serial Number"
                value={result.extraction.serialNumber}
                delayMs={120}
              />
              <FieldCard
                label="Manufacture Date"
                value={
                  result.decoding?.manufactureDate ??
                  result.extraction.printedDate ??
                  null
                }
                determination={
                  result.decoding?.determination ||
                  (result.extraction.printedDate
                    ? "Read directly from the printed date on the nameplate."
                    : result.extraction.serialNumber
                      ? "Could not decode this serial format."
                      : undefined)
                }
                confidence={result.decoding?.confidence}
                delayMs={180}
              />

              {/* Learned format detail block */}
              {result.decoding?.serialFormat && (
                <article
                  className="anim-rise border border-border bg-card px-5 py-4"
                  style={{ animationDelay: "240ms" }}
                >
                  <div className="label-stamp mb-2">
                    Serial-number format {result.usedKnownFormat ? "· recalled" : "· newly learned"}
                  </div>
                  <p className="text-sm text-foreground/90 leading-relaxed">
                    <span className="font-serif text-primary">Format. </span>
                    {result.decoding.serialFormat}
                  </p>
                  <p className="text-sm text-foreground/90 leading-relaxed mt-2">
                    <span className="font-serif text-primary">Date encoding. </span>
                    {result.decoding.dateDecoding}
                  </p>
                  {result.decoding.sources && result.decoding.sources.length > 0 && (
                    <p className="text-xs text-muted-foreground mt-3">
                      Sources: {result.decoding.sources.join(" · ")}
                    </p>
                  )}
                </article>
              )}

              {/* Raw OCR — collapsible */}
              {result.extraction.rawText && (
                <details
                  className="anim-rise border border-border bg-card px-5 py-3"
                  style={{ animationDelay: "300ms" }}
                >
                  <summary className="label-stamp cursor-pointer text-muted-foreground hover:text-primary transition-colors">
                    Raw nameplate text
                  </summary>
                  <pre className="mt-3 text-xs font-mono text-foreground/80 whitespace-pre-wrap leading-relaxed">
                    {result.extraction.rawText}
                  </pre>
                  {result.extraction.notes && (
                    <p className="text-xs text-muted-foreground mt-2 italic">
                      {result.extraction.notes}
                    </p>
                  )}
                </details>
              )}
            </section>
          )}
        </div>
      </main>

      <footer className="border-t border-border py-6">
        <div className="mx-auto max-w-3xl px-6 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="label-stamp text-muted-foreground">
            Equipment ID · static client · OpenAI Vision
          </p>
          <p className="text-xs text-muted-foreground">
            Your API key never leaves your browser.
          </p>
        </div>
      </footer>

      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        settings={settings}
        onSave={handleSettingsSave}
      />
    </div>
  );
}
