/*
 * Equipment ID — Upload zone.
 * A tall, dashed rectangle that evokes a film-negative holder. Accepts
 * JPG/PNG, supports drag-and-drop and click-to-browse. Shows a thumbnail
 * preview when a file is selected.
 */
import { useCallback, useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  file: File | null;
  previewUrl: string | null;
  onFileSelected: (file: File | null) => void;
  disabled?: boolean;
}

const ACCEPTED = ["image/jpeg", "image/jpg", "image/png"];

export function UploadZone({ file, previewUrl, onFileSelected, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = useCallback(
    (f: File | null | undefined) => {
      if (!f) return;
      if (!ACCEPTED.includes(f.type)) {
        alert("Please upload a JPG or PNG image.");
        return;
      }
      onFileSelected(f);
    },
    [onFileSelected],
  );

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    if (disabled) return;
    handleFile(e.dataTransfer.files?.[0]);
  };

  const onClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onFileSelected(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Upload nameplate photo"
      onClick={() => !disabled && inputRef.current?.click()}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && !disabled) {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      className={cn(
        "relative w-full border border-dashed transition-colors duration-150",
        "bg-card/50 select-none",
        "min-h-[260px] flex items-center justify-center",
        dragOver
          ? "border-primary bg-primary/5"
          : "border-border hover:border-primary/60",
        disabled && "opacity-60 pointer-events-none",
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />

      {/* Corner ticks — viewfinder feel */}
      <span className="absolute top-2 left-2 w-3 h-3 border-l border-t border-primary/40" />
      <span className="absolute top-2 right-2 w-3 h-3 border-r border-t border-primary/40" />
      <span className="absolute bottom-2 left-2 w-3 h-3 border-l border-b border-primary/40" />
      <span className="absolute bottom-2 right-2 w-3 h-3 border-r border-b border-primary/40" />

      {file && previewUrl ? (
        <div className="w-full p-4 flex flex-col sm:flex-row gap-4 items-center">
          <img
            src={previewUrl}
            alt="Uploaded nameplate preview"
            className="max-h-40 sm:max-h-44 w-auto object-contain border border-border bg-white"
          />
          <div className="flex-1 min-w-0 text-left">
            <div className="label-stamp">Selected file</div>
            <div className="font-serif text-lg text-primary truncate">
              {file.name}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {(file.size / 1024).toFixed(1)} KB · {file.type.replace("image/", "").toUpperCase()}
            </div>
            <button
              type="button"
              onClick={onClear}
              className="mt-3 inline-flex items-center gap-1 label-stamp text-muted-foreground hover:text-destructive transition-colors"
            >
              <X size={12} /> Remove
            </button>
          </div>
        </div>
      ) : (
        <div className="text-center px-6 py-10">
          <div className="mx-auto w-10 h-10 border border-primary/40 flex items-center justify-center mb-4">
            <ImagePlus size={18} className="text-primary" />
          </div>
          <p className="font-serif text-lg text-primary">
            Drop a nameplate photo here
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            or click to browse — JPG or PNG
          </p>
          <p className="label-stamp mt-4 text-muted-foreground">
            Max recommended size · 10 MB
          </p>
        </div>
      )}
    </div>
  );
}
