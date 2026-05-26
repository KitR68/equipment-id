/*
 * Equipment ID — Home page.
 *
 * Industrial Dossier layout: nameplate header, mode tabs (Upload Photo /
 * Manual Entry), input area, navy "Analyze" button, then stamped field
 * cards for the results.
 *
 * Two analysis paths:
 *   Upload Photo  → QR scan (client-side) + vision extraction → serial decoding
 *   Manual Entry  → skip vision, go straight to serial decoding
 *
 * New fields: Date Code (both modes) and QR Code data (upload mode only).
 */
import { useEffect, useMemo, useState } from "react";
import {
  Loader2,
  Settings as SettingsIcon,
  ScanSearch,
  AlertTriangle,
  BookOpen,
  Upload,
  PenLine,
  QrCode,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { UploadZone } from "@/components/UploadZone";
import { ManualEntryForm, type ManualFields } from "@/components/ManualEntryForm";
import { FieldCard } from "@/components/FieldCard";
import { CorrectAndTeach } from "@/components/CorrectAndTeach";
import { SettingsDialog } from "@/components/SettingsDialog";
import {
  loadKnowledgeBase,
  loadSettings,
  saveKnowledgeBase,
  saveSettings,
  getManufacturerEntry,
  upsertManufacturerEntry,
  manufacturerKey,
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
import { decodeQrFromFile } from "@/lib/qr";
import {
  fetchCloudKnowledge,
  mergeKnowledgeBases,
  pushCloudEntry,
} from "@/lib/cloudKnowledge";
import { applySeedKnowledge } from "@/lib/seedLoader";
import { cn } from "@/lib/utils";

type CloudStatus = "checking" | "online" | "offline";

type InputMode = "upload" | "manual";

interface AnalysisResult {
  extraction: NameplateExtraction;
  decoding?: SerialDecoding;
  usedKnownFormat: boolean;
  inputMode: InputMode;
  finishedAt: string;
}

const EMPTY_MANUAL: ManualFields = {
  manufacturer: "",
  modelNumber: "",
  serialNumber: "",
  dateCode: "",
  prodDate: "",
};

export default function Home() {
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [kb, setKb] = useState<KnowledgeBase>(() => loadKnowledgeBase());
  const [settingsOpen, setSettingsOpen] = useState(false);

  // ── Input mode ──────────────────────────────────────────────────────────
  const [inputMode, setInputMode] = useState<InputMode>("upload");

  // ── Upload mode state ────────────────────────────────────────────────────
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // ── Manual mode state ────────────────────────────────────────────────────
  const [manualFields, setManualFields] = useState<ManualFields>(EMPTY_MANUAL);

  // ── Analysis state ───────────────────────────────────────────────────────
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);

  // Object URL lifecycle for the thumbnail preview.
  useEffect(() => {
    if (!file) { setPreviewUrl(null); return; }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Cloud sync state.
  const [cloudStatus, setCloudStatus] = useState<CloudStatus>("checking");

  // Open settings on first load if no API key is present, and pull the
  // shared cloud knowledge base then merge with local storage. After the
  // merge resolves (online or offline), apply the bundled seed knowledge
  // base — inserting only entries the user/cloud doesn't already have —
  // and push any freshly-seeded entries to the cloud so all clients
  // benefit from the curated dataset.
  useEffect(() => {
    if (!settings.openaiApiKey) setSettingsOpen(true);
    let cancelled = false;

    const seedAndPush = (base: KnowledgeBase, cloudOnline: boolean) => {
      const { merged, seededCount, alreadyImported } = applySeedKnowledge(base);
      setKb(merged);
      saveKnowledgeBase(merged);
      if (seededCount > 0 && !alreadyImported) {
        toast.message(
          `Seeded ${seededCount} manufacturer decoding rule${
            seededCount === 1 ? "" : "s"
          }`,
          {
            description:
              "Pre-loaded HVAC, water heater, boiler, appliance, elevator, and fire/safety formats.",
          },
        );
        if (cloudOnline) {
          // Fire-and-forget upload of freshly-seeded entries so other
          // clients receive the same seed data via the cloud KB.
          for (const entry of Object.values(merged)) {
            if (!base[manufacturerKey(entry.name)]) {
              void pushCloudEntry(entry);
            }
          }
        }
      }
    };

    fetchCloudKnowledge().then((res) => {
      if (cancelled) return;
      const local = loadKnowledgeBase();
      if (res.ok) {
        setCloudStatus("online");
        const merged = mergeKnowledgeBases(local, res.entries);
        seedAndPush(merged, true);
      } else {
        setCloudStatus("offline");
        seedAndPush(local, false);
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFileSelected = (f: File | null) => {
    setFile(f);
    setResult(null);
    setError(null);
  };

  const handleManualChange = (fields: ManualFields) => {
    setManualFields(fields);
    setResult(null);
    setError(null);
  };

  const handleModeChange = (mode: InputMode) => {
    setInputMode(mode);
    setResult(null);
    setError(null);
  };

  const handleSettingsSave = (next: AppSettings) => {
    setSettings(next);
    saveSettings(next);
    setKb(loadKnowledgeBase());
  };

  /**
   * Called by CorrectAndTeach when the user saves a corrected decoding rule.
   * Persists to localStorage and fire-and-forgets a cloud push.
   */
  const handleTeach = (entry: import("@/lib/storage").ManufacturerEntry) => {
    const slug = entry.name.trim().toLowerCase().replace(/\s+/g, " ");
    const nextKb = { ...kb, [slug]: entry };
    setKb(nextKb);
    saveKnowledgeBase(nextKb);
    toast.success("Pattern saved", {
      description: `Decoding rule for ${entry.name} updated in the knowledge base.`,
    });
    // Cloud push (fire-and-forget)
    void pushCloudEntry(entry).then((r) => {
      if (r.ok) {
        setCloudStatus("online");
      } else {
        setCloudStatus("offline");
        toast.error("Cloud sync failed", { description: r.error });
      }
    });
  };

  const learnedCount = useMemo(() => Object.keys(kb).length, [kb]);

  // ── Can we submit? ───────────────────────────────────────────────────────
  const canAnalyze = useMemo(() => {
    if (analyzing) return false;
    if (inputMode === "upload") return Boolean(file);
    return Boolean(manualFields.manufacturer.trim() && manualFields.serialNumber.trim());
  }, [analyzing, inputMode, file, manualFields]);

  // ── Core analysis logic ──────────────────────────────────────────────────
  const handleAnalyze = async () => {
    if (!canAnalyze) return;
    if (!settings.openaiApiKey) {
      toast.error("Add your OpenAI API key in settings first.");
      setSettingsOpen(true);
      return;
    }

    setAnalyzing(true);
    setError(null);
    setResult(null);

    try {
      let extraction: NameplateExtraction;

      if (inputMode === "upload" && file) {
        // ── Path A: QR scan then vision extraction ───────────────────────
        setProgress("Scanning for QR code…");
        const qrData = await decodeQrFromFile(file);

        if (qrData) {
          setProgress("QR code found — reading nameplate text…");
        } else {
          setProgress("Reading nameplate text…");
        }

        const dataUrl = await fileToDataUrl(file);
        extraction = await extractNameplate(
          dataUrl,
          settings.openaiApiKey,
          settings.model,
          qrData,
        );
        // Ensure qrData is stored even if the model didn't echo it back
        if (qrData && !extraction.qrData) {
          extraction = { ...extraction, qrData };
        }
      } else {
        // ── Path B: manual entry — synthetic extraction object ───────────
        extraction = {
          manufacturer: manualFields.manufacturer.trim() || null,
          modelNumber: manualFields.modelNumber.trim() || null,
          serialNumber: manualFields.serialNumber.trim() || null,
          dateCode: manualFields.dateCode.trim() || null,
          prodDate: manualFields.prodDate.trim() || null,
          printedDate: null,
          qrData: null,
          rawText: [
            manualFields.manufacturer,
            manualFields.modelNumber,
            manualFields.serialNumber,
            manualFields.dateCode,
            manualFields.prodDate,
          ]
            .filter(Boolean)
            .join(" | "),
          notes: "Entered manually — no image was analyzed.",
        };
      }

      // ── Serial decoding (both paths) ─────────────────────────────────────
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
            dateCode: extraction.dateCode,
            prodDate: extraction.prodDate,
            printedDate: extraction.printedDate,
            qrData: extraction.qrData,
            knownEntry,
          },
        );

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
          // Push to the shared cloud knowledge base (fire-and-forget).
          const slug = extraction.manufacturer.trim().toLowerCase().replace(/\s+/g, " ");
          const justSaved = nextKb[slug];
          if (justSaved) {
            void pushCloudEntry(justSaved).then((r) => {
              if (r.ok) {
                setCloudStatus("online");
              } else {
                setCloudStatus("offline");
              }
            });
          }
        }
      }

      setResult({
        extraction,
        decoding,
        usedKnownFormat,
        inputMode,
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
          <p className="text-muted-foreground text-base leading-relaxed mb-8 max-w-2xl">
            Upload a photo of an equipment dataplate, or enter the details
            manually. QR codes in photos are automatically detected and decoded.
            The system decodes the manufacture date from the serial number —
            learning new manufacturer formats as it goes.
          </p>

          {/* ── Mode tabs ─────────────────────────────────────────────── */}
          <div
            role="tablist"
            aria-label="Input mode"
            className="flex border border-border bg-card/50 mb-6 w-fit"
          >
            {(
              [
                { mode: "upload" as InputMode, icon: Upload, label: "Upload Photo" },
                { mode: "manual" as InputMode, icon: PenLine, label: "Manual Entry" },
              ] as const
            ).map(({ mode, icon: Icon, label }) => (
              <button
                key={mode}
                role="tab"
                aria-selected={inputMode === mode}
                type="button"
                onClick={() => handleModeChange(mode)}
                disabled={analyzing}
                className={cn(
                  "inline-flex items-center gap-2 px-5 py-2.5 label-stamp transition-colors duration-150",
                  inputMode === mode
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-primary hover:bg-accent",
                )}
              >
                <Icon size={13} />
                {label}
              </button>
            ))}
          </div>

          {/* ── Input area ────────────────────────────────────────────── */}
          <section className="space-y-5">
            {inputMode === "upload" ? (
              <>
                <UploadZone
                  file={file}
                  previewUrl={previewUrl}
                  onFileSelected={handleFileSelected}
                  disabled={analyzing}
                />
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <QrCode size={12} className="shrink-0" />
                  QR codes in the photo are automatically detected and used to assist identification.
                </p>
              </>
            ) : (
              <ManualEntryForm
                fields={manualFields}
                onChange={handleManualChange}
                disabled={analyzing}
              />
            )}

            <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2 label-stamp text-muted-foreground">
                  <BookOpen size={12} />
                  {learnedCount === 0
                    ? "Knowledge base empty"
                    : `${learnedCount} manufacturer${learnedCount === 1 ? "" : "s"} learned`}
                </div>
                <span
                  className="label-stamp text-muted-foreground"
                  data-status={cloudStatus}
                  title={
                    cloudStatus === "online"
                      ? "Shared knowledge base reachable"
                      : cloudStatus === "offline"
                        ? "Cloud knowledge base unreachable; entries saved locally"
                        : "Connecting to cloud knowledge base"
                  }
                >
                  {cloudStatus === "online"
                    ? "· cloud-synced"
                    : cloudStatus === "offline"
                      ? "· local only"
                      : "· syncing…"}
                </span>
              </div>
              <Button
                onClick={handleAnalyze}
                disabled={!canAnalyze}
                className="bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[0.98] transition-transform duration-150 px-6 h-11 rounded-sm font-medium tracking-wide"
              >
                {analyzing ? (
                  <>
                    <Loader2 className="animate-spin mr-2" size={16} />
                    Analyzing…
                  </>
                ) : inputMode === "manual" ? (
                  "Look Up Date"
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
                <AlertTriangle size={16} className="text-destructive mt-0.5 shrink-0" />
                <div className="text-sm text-destructive">{error}</div>
              </div>
            )}
          </section>

          {/* ── Results ───────────────────────────────────────────────── */}
          {result && (
            <section className="mt-12 space-y-4">
              <header className="flex items-end justify-between border-b border-border pb-3">
                <div>
                  <div className="label-stamp">Identification</div>
                  <h2 className="font-serif text-xl text-primary mt-1">
                    Extracted Fields
                  </h2>
                </div>
                <div className="flex items-center gap-2 flex-wrap justify-end">
                  {result.extraction.qrData && (
                    <span className="chip-confidence" data-level="high">
                      QR decoded
                    </span>
                  )}
                  {result.extraction.prodDate && (
                    <span className="chip-confidence" data-level="high">
                      Prod date found
                    </span>
                  )}
                  {result.inputMode === "manual" && (
                    <span className="chip-confidence" data-level="medium">
                      Manual entry
                    </span>
                  )}
                  {result.usedKnownFormat && (
                    <span className="chip-confidence" data-level="high">
                      Known format · KB hit
                    </span>
                  )}
                </div>
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
                label="Date Code"
                value={result.extraction.dateCode}
                determination={
                  result.extraction.dateCode
                    ? "Date code extracted from the nameplate."
                    : undefined
                }
                delayMs={180}
              />
              <FieldCard
                label="Prod Date"
                value={result.extraction.prodDate}
                determination={
                  result.extraction.prodDate
                    ? "Production date found in a labelled PROD DATE / MFG DATE field on the nameplate. Used as the primary manufacture date when present."
                    : undefined
                }
                confidence={result.extraction.prodDate ? "high" : undefined}
                delayMs={210}
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
                delayMs={240}
              />

              {/* Correct & Teach panel — shown whenever we have a manufacturer */}
              {result.extraction.manufacturer && (
                <CorrectAndTeach
                  manufacturer={result.extraction.manufacturer}
                  currentEntry={
                    kb[
                      result.extraction.manufacturer
                        .trim()
                        .toLowerCase()
                        .replace(/\s+/g, " ")
                    ]
                  }
                  cloudStatus={cloudStatus}
                  onSave={handleTeach}
                />
              )}

              {/* QR code data card */}
              {result.extraction.qrData && (
                <article
                  className="anim-rise border border-border bg-card grid grid-cols-[120px_1fr] sm:grid-cols-[140px_1fr]"
                  style={{ animationDelay: "300ms" }}
                >
                  <div className="border-r border-border bg-secondary/40 px-4 py-5 flex items-start gap-2">
                    <QrCode size={13} className="text-primary mt-0.5 shrink-0" />
                    <span className="label-stamp">QR Code</span>
                  </div>
                  <div className="px-5 py-5 min-w-0">
                    <p className="font-mono text-xs text-foreground/90 break-all leading-relaxed">
                      {result.extraction.qrData}
                    </p>
                    <p className="text-xs text-muted-foreground mt-2">
                      Decoded from the image and used to assist field extraction.
                    </p>
                  </div>
                </article>
              )}

              {/* Learned format detail */}
              {result.decoding?.serialFormat && (
                <article
                  className="anim-rise border border-border bg-card px-5 py-4"
                  style={{ animationDelay: "360ms" }}
                >
                  <div className="label-stamp mb-2">
                    Serial-number format{" "}
                    {result.usedKnownFormat ? "· recalled" : "· newly learned"}
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

              {/* Raw OCR — only shown for photo mode */}
              {result.inputMode === "upload" && result.extraction.rawText && (
                <details
                  className="anim-rise border border-border bg-card px-5 py-3"
                  style={{ animationDelay: "420ms" }}
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
