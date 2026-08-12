import React from "react";
import { cn } from "@/lib/utils";

/**
 * Shared dense form primitives for the property editing surfaces
 * (/admin/edit-property and ROLOS → Property Setup).
 *
 * Presentation only — no state, no validation. Use these instead of ad-hoc
 * card/label/grid markup so both surfaces keep one rhythm and alignment grid.
 */

interface FormSectionProps {
  title?: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
  /**
   * When provided the section becomes collapsible and starts collapsed while the
   * requirement is met, so a long form only shows what still needs attention.
   * Flipping back to `false` re-opens it automatically.
   */
  satisfied?: boolean;
  /** One-line recap shown in place of the body while collapsed. */
  collapsedSummary?: string;
  children: React.ReactNode;
}

/** Titled block with a thin rule instead of a heavy nested card. */
export const FormSection: React.FC<FormSectionProps> = ({
  title,
  description,
  actions,
  className,
  satisfied,
  collapsedSummary,
  children,
}) => {
  const collapsible = satisfied !== undefined;
  // null = follow `satisfied`; true/false = the user overrode it by clicking.
  const [manual, setManual] = React.useState<boolean | null>(null);
  React.useEffect(() => {
    // A section that stops being satisfied must re-open even if it was closed by hand.
    if (!satisfied) setManual(null);
  }, [satisfied]);
  const open = manual ?? !satisfied;

  return (
    <section className={cn("pf-section", className)}>
      {(title || actions) && (
        <div className="mb-2 flex items-end justify-between gap-3 border-b border-border/60 pb-1.5">
          <div className="min-w-0">
            {title &&
              (collapsible ? (
                <button
                  type="button"
                  onClick={() => setManual(!open)}
                  aria-expanded={open}
                  className="flex items-center gap-1.5 text-left"
                >
                  <ChevronRight
                    className={cn(
                      "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
                      open && "rotate-90",
                    )}
                  />
                  <h3 className="pf-section-title">{title}</h3>
                  {satisfied && (
                    <span className="inline-flex items-center gap-0.5 rounded border border-border/60 bg-muted/40 px-1 py-px text-[10px] text-muted-foreground">
                      <Check className="h-2.5 w-2.5" /> Complete
                    </span>
                  )}
                </button>
              ) : (
                <h3 className="pf-section-title">{title}</h3>
              ))}
            {description && (open || !collapsible) && (
              <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">{description}</p>
            )}
            {collapsible && !open && collapsedSummary && (
              <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">{collapsedSummary}</p>
            )}
          </div>
          {actions && open && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
        </div>
      )}
      {open && children}
    </section>
  );
};


interface FieldGridProps {
  /** Columns at lg and above. Defaults to 2. */
  cols?: 1 | 2 | 3 | 4;
  className?: string;
  children: React.ReactNode;
}

const COLS: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-1 md:grid-cols-2",
  3: "grid-cols-1 md:grid-cols-2 xl:grid-cols-3",
  4: "grid-cols-2 md:grid-cols-3 xl:grid-cols-4",
};

/** Aligned responsive field grid with one consistent gutter. */
export const FieldGrid: React.FC<FieldGridProps> = ({ cols = 2, className, children }) => (
  <div className={cn("grid gap-x-4 gap-y-3", COLS[cols], className)}>{children}</div>
);

interface FieldProps {
  label?: React.ReactNode;
  htmlFor?: string;
  hint?: React.ReactNode;
  required?: boolean;
  /** Span the full grid width (long text, editors, tables). */
  full?: boolean;
  className?: string;
  children: React.ReactNode;
}

/** Label + control + helper text with a fixed vertical rhythm. */
export const Field: React.FC<FieldProps> = ({
  label,
  htmlFor,
  hint,
  required,
  full,
  className,
  children,
}) => (
  <div className={cn("space-y-1", full && "md:col-span-2 xl:col-span-3", className)}>
    {label && (
      <label htmlFor={htmlFor} className="block text-xs font-medium text-foreground">
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </label>
    )}
    {children}
    {hint && <p className="text-[11px] leading-tight text-muted-foreground">{hint}</p>}
  </div>
);

/** Compact inline toggle row (switch/checkbox + copy) that keeps grid alignment. */
export const ToggleRow: React.FC<{
  label: React.ReactNode;
  hint?: React.ReactNode;
  control: React.ReactNode;
  className?: string;
}> = ({ label, hint, control, className }) => (
  <div
    className={cn(
      "flex items-start justify-between gap-3 rounded-md border border-border/60 bg-muted/30 px-2.5 py-2",
      className,
    )}
  >
    <div className="min-w-0 space-y-0.5">
      <p className="text-xs font-medium leading-tight">{label}</p>
      {hint && <p className="text-[11px] leading-tight text-muted-foreground">{hint}</p>}
    </div>
    <div className="shrink-0 pt-0.5">{control}</div>
  </div>
);
