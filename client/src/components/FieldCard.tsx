/*
 * Equipment ID — FieldCard.
 * The signature motif of the page: a stamped dataplate field with a left
 * mono uppercase label gutter and a right Fraunces value area. Used for
 * Manufacturer / Model / Serial / Manufacture Date.
 */
import { cn } from "@/lib/utils";

interface Props {
  label: string;
  value: string | null;
  determination?: string;
  confidence?: "high" | "medium" | "low";
  delayMs?: number;
}

export function FieldCard({
  label,
  value,
  determination,
  confidence,
  delayMs = 0,
}: Props) {
  return (
    <article
      className={cn(
        "anim-rise border border-border bg-card",
        "grid grid-cols-[120px_1fr] sm:grid-cols-[140px_1fr]",
      )}
      style={{ animationDelay: `${delayMs}ms` }}
    >
      <div
        className={cn(
          "border-r border-border bg-secondary/40",
          "px-4 py-5 flex items-start",
        )}
      >
        <span className="label-stamp">{label}</span>
      </div>
      <div className="px-5 py-5 min-w-0">
        <div className="value-stamp break-words">
          {value ?? <span className="text-muted-foreground italic font-sans text-sm">Not detected</span>}
        </div>
        {determination && (
          <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
            {determination}
          </p>
        )}
        {confidence && (
          <div className="mt-3">
            <span className="chip-confidence" data-level={confidence}>
              {confidence === "high"
                ? "High confidence"
                : confidence === "low"
                  ? "Low confidence"
                  : "Inferred"}
            </span>
          </div>
        )}
      </div>
    </article>
  );
}
