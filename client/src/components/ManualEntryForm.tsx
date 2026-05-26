/*
 * Equipment ID — ManualEntryForm.
 * Industrial Dossier styling: label-stamp headers, Fraunces values.
 * Fields: Manufacturer, Model Number, Serial Number, Date Code, Prod Date.
 */
import { Input } from "@/components/ui/input";

export interface ManualFields {
  manufacturer: string;
  modelNumber: string;
  serialNumber: string;
  dateCode: string;
  prodDate: string;
}

interface Props {
  fields: ManualFields;
  onChange: (fields: ManualFields) => void;
  disabled?: boolean;
}

export function ManualEntryForm({ fields, onChange, disabled }: Props) {
  const set =
    (key: keyof ManualFields) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      onChange({ ...fields, [key]: e.target.value });

  return (
    <div className="border border-border bg-card/50 p-6 space-y-5 relative">
      {/* Corner ticks */}
      <span className="absolute top-0 left-0 w-3 h-3 border-l border-t border-primary/40 pointer-events-none" />
      <span className="absolute top-0 right-0 w-3 h-3 border-r border-t border-primary/40 pointer-events-none" />
      <span className="absolute bottom-0 left-0 w-3 h-3 border-l border-b border-primary/40 pointer-events-none" />
      <span className="absolute bottom-0 right-0 w-3 h-3 border-r border-b border-primary/40 pointer-events-none" />

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

      <div className="space-y-1.5">
        <label htmlFor="me-datecode" className="label-stamp block">
          Date Code
          <span className="ml-2 text-xs font-sans normal-case tracking-normal text-muted-foreground">
            (optional)
          </span>
        </label>
        <Input
          id="me-datecode"
          value={fields.dateCode}
          onChange={set("dateCode")}
          placeholder="e.g. 2305, A14, 0519, WK23-18"
          disabled={disabled}
          className="font-mono text-sm text-primary placeholder:font-sans placeholder:text-sm placeholder:text-muted-foreground"
          spellCheck={false}
        />
        <p className="text-xs text-muted-foreground">
          A short alphanumeric code stamped separately from the serial number that encodes the manufacture date.
        </p>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="me-proddate" className="label-stamp block">
          Prod Date
          <span className="ml-2 text-xs font-sans normal-case tracking-normal text-muted-foreground">
            (optional — from PROD DATE / MFG DATE label)
          </span>
        </label>
        <Input
          id="me-proddate"
          value={fields.prodDate}
          onChange={set("prodDate")}
          placeholder="e.g. 20230914, 2023-09-14, 09/2023, SEP 2023"
          disabled={disabled}
          className="font-mono text-sm text-primary placeholder:font-sans placeholder:text-sm placeholder:text-muted-foreground"
          spellCheck={false}
        />
        <p className="text-xs text-muted-foreground">
          Enter the value from a labelled PROD DATE, MFG DATE, DATE OF MFG, or similar field
          exactly as printed. When present, this is used as the primary manufacture date.
        </p>
      </div>
    </div>
  );
}
