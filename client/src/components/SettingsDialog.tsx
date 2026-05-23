/*
 * Equipment ID — Settings dialog.
 * Industrial Dossier styling: white sheet, navy ink, mono labels, no
 * gradients or rounded-pill anything. Holds the OpenAI API key, the model
 * choice, and the learning knowledge base inspector.
 */
import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trash2, Eye, EyeOff, Cloud, CloudOff, Loader2 } from "lucide-react";
import {
  loadKnowledgeBase,
  saveKnowledgeBase,
  deleteManufacturerEntry,
  type AppSettings,
  type KnowledgeBase,
} from "@/lib/storage";
import {
  fetchCloudKnowledge,
  deleteCloudEntry,
  mergeKnowledgeBases,
} from "@/lib/cloudKnowledge";
import { toast } from "sonner";

type CloudStatus = "idle" | "checking" | "online" | "offline";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: AppSettings;
  onSave: (next: AppSettings) => void;
}

export function SettingsDialog({ open, onOpenChange, settings, onSave }: Props) {
  const [apiKey, setApiKey] = useState(settings.openaiApiKey);
  const [model, setModel] = useState(settings.model);
  const [reveal, setReveal] = useState(false);
  const [kb, setKb] = useState<KnowledgeBase>({});
  const [cloudStatus, setCloudStatus] = useState<CloudStatus>("idle");
  // cloudError state slot reserved for future surfacing
  const [, setCloudError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setApiKey(settings.openaiApiKey);
    setModel(settings.model);
    setKb(loadKnowledgeBase());
    setReveal(false);

    let cancelled = false;
    setCloudStatus("checking");
    setCloudError(null);
    fetchCloudKnowledge().then((res) => {
      if (cancelled) return;
      if (res.ok) {
        setCloudStatus("online");
        const local = loadKnowledgeBase();
        const merged = mergeKnowledgeBases(local, res.entries);
        setKb(merged);
        saveKnowledgeBase(merged);
      } else {
        setCloudStatus("offline");
        setCloudError(res.error ?? null);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open, settings]);

  const handleSave = () => {
    onSave({ openaiApiKey: apiKey.trim(), model: model.trim() || "gpt-4o" });
    toast.success("Settings saved");
    onOpenChange(false);
  };

  const handleDelete = async (name: string) => {
    const next = deleteManufacturerEntry(kb, name);
    setKb(next);
    saveKnowledgeBase(next);
    toast.message(`Removed ${name} from knowledge base`);
    if (cloudStatus === "online") {
      const res = await deleteCloudEntry(name);
      if (!res.ok) {
        toast.error("Cloud delete failed", { description: res.error });
      }
    }
  };

  const handleClearAll = () => {
    setKb({});
    saveKnowledgeBase({});
    toast.message("Cleared learned manufacturers");
  };

  const entries = Object.values(kb).sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px] bg-background border-border">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl tracking-tight text-primary">
            Configuration
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Your OpenAI API key is stored only in this browser&apos;s
            localStorage. It is sent directly to OpenAI from your device — no
            server proxies the request.
          </DialogDescription>
        </DialogHeader>

        <div
          className="flex items-start gap-3 border border-border bg-secondary/40 px-4 py-3"
          aria-live="polite"
        >
          {cloudStatus === "checking" && (
            <Loader2 size={14} className="mt-0.5 animate-spin text-muted-foreground" />
          )}
          {cloudStatus === "online" && (
            <Cloud size={14} className="mt-0.5 text-primary" />
          )}
          {(cloudStatus === "offline" || cloudStatus === "idle") && (
            <CloudOff size={14} className="mt-0.5 text-muted-foreground" />
          )}
          <div className="flex-1 min-w-0">
            <div className="label-stamp text-primary">
              {cloudStatus === "checking" && "Checking shared knowledge base…"}
              {cloudStatus === "online" && "Knowledge base · cloud-synced"}
              {cloudStatus === "offline" && "Knowledge base · local only"}
              {cloudStatus === "idle" && "Knowledge base · local"}
            </div>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              {cloudStatus === "online"
                ? "Learned manufacturer formats are shared via Azure Table Storage so every device benefits from the same knowledge."
                : cloudStatus === "offline"
                  ? "The shared knowledge API is unreachable. New formats are still saved locally and will sync once the API is available."
                  : "Connecting to the shared knowledge base."}
            </p>
          </div>
        </div>

        <div className="space-y-6 py-2">
          <div className="space-y-2">
            <Label htmlFor="apiKey" className="label-stamp">
              OpenAI API Key
            </Label>
            <div className="relative">
              <Input
                id="apiKey"
                type={reveal ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-..."
                className="font-mono pr-10"
                autoComplete="off"
                spellCheck={false}
              />
              <button
                type="button"
                aria-label={reveal ? "Hide key" : "Show key"}
                onClick={() => setReveal((r) => !r)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary transition-colors"
              >
                {reveal ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="model" className="label-stamp">
              Vision Model
            </Label>
            <Input
              id="model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="gpt-4o"
              className="font-mono"
              spellCheck={false}
            />
            <p className="text-xs text-muted-foreground">
              Must be a vision-capable chat model (e.g.&nbsp;
              <code className="font-mono">gpt-4o</code>,&nbsp;
              <code className="font-mono">gpt-4o-mini</code>,&nbsp;
              <code className="font-mono">gpt-4-turbo</code>).
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="label-stamp">
                Learned Manufacturers ({entries.length})
              </Label>
              {entries.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearAll}
                  className="text-xs label-stamp text-destructive hover:underline"
                >
                  Clear all
                </button>
              )}
            </div>
            <div className="border border-border bg-card max-h-56 overflow-y-auto">
              {entries.length === 0 ? (
                <p className="px-4 py-6 text-sm text-muted-foreground text-center">
                  No manufacturers learned yet. Each new manufacturer you
                  analyze is saved here.
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {entries.map((m) => (
                    <li
                      key={m.name}
                      className="px-4 py-3 flex items-start justify-between gap-4"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-serif text-base text-primary">
                          {m.name}
                        </div>
                        <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                          {m.serialFormat}
                        </div>
                        <div className="label-stamp mt-1">
                          {m.usageCount}× · updated{" "}
                          {new Date(m.updatedAt).toLocaleDateString()}
                        </div>
                      </div>
                      <button
                        type="button"
                        aria-label={`Forget ${m.name}`}
                        onClick={() => handleDelete(m.name)}
                        className="text-muted-foreground hover:text-destructive transition-colors p-1"
                      >
                        <Trash2 size={14} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="bg-background"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
