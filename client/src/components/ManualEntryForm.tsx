/*
 * Equipment ID — ManualEntryForm.
 * Industrial Dossier styling: label-stamp headers, Fraunces values, no
 * rounded-pill anything. Lets the user type manufacturer / model / serial
 * directly. The parent skips the vision step and goes straight to serial
 * decoding when this form is submitted.
 */
import { Input } from "@/components/ui/input";

export interface ManualFields {
  manufacturer: string;
  modelNumber: string;
  serialNumber: string;
}

interface Props {
  fields: ManualFields;
  onChange: (fields: ManualFields) => void;
  disabled?: boolean;
}

export function ManualEntryForm({ fields, onChange, disabled }: Props) {
  const set = (key: keyof ManualFields) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...fields, [key]: e.target.value });

  return (
    <div className="border border-border bg-card/50 p-6 space-y-5">
      {/* Corner ticks — match the upload zone aesthetic */}
      <div className="relative pointer-events-none">
        <span className="absolute -top-6 -left-6 w-3 h-3 border-l border-t border-primary/40" />
        <span className="absolute -top-6 -right-6 w-3 h-3 border-r border-t border-primary/40" />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="me-manufacturer" className="label-stamp block">
          Manufacturer <span className="text-destructive">*</span>
        </label>
        <Input
          id="me-manufacturer"
          value={fields.manufacturer}
          onChange={set("manufacturer")}
          placeholder="e.g. Carrier, Trane, Siemens…"
          disabled={disabled}
          className="font-serif text-base text-primary placeholder:font-sans placeholder:text-sm placeholder:text-muted-foreground"
          spellCheck={false}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="me-model" className="label-stamp block">
          Model Number
        </label>
        <Input
          id="me-model"
          value={fields.modelNumber}
          onChange={set("modelNumber")}
          placeholder="e.g. 50XC-060"
          disabled={disabled}
          className="font-mono text-sm text-primary placeholder:font-sans placeholder:text-sm placeholder:text-muted-foreground"
          spellCheck={false}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="me-serial" className="label-stamp block">
          Serial Number <span className="text-destructive">*</span>
        </label>
        <Input
          id="me-serial"
          value={fields.serialNumber}
          onChange={set("serialNumber")}
          placeholder="e.g. 2305A12345"
          disabled={disabled}
          className="font-mono text-sm text-primary placeholder:font-sans placeholder:text-sm placeholder:text-muted-foreground"
          spellCheck={false}
        />
        <p className="text-xs text-muted-foreground">
          Manufacturer and serial number are required to decode the manufacture date.
        </p>
      </div>

      {/* Bottom corner ticks */}
      <div className="relative pointer-events-none h-0">
        <span className="absolute -bottom-6 -left-6 w-3 h-3 border-l border-b border-primary/40" />
        <span className="absolute -bottom-6 -right-6 w-3 h-3 border-r border-b border-primary/40" />
      </div>
    </div>
  );
}
