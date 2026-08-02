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
  children: React.ReactNode;
}

/** Titled block with a thin rule instead of a heavy nested card. */
export const FormSection: React.FC<FormSectionProps> = ({
  title,
  description,
  actions,
  className,
  children,
}) => (
  <section className={cn("pf-section", className)}>
    {(title || actions) && (
      <div className="mb-2 flex items-end justify-between gap-3 border-b border-border/60 pb-1.5">
        <div className="min-w-0">
          {title && <h3 className="pf-section-title">{title}</h3>}
          {description && (
            <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">{description}</p>
          )}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
      </div>
    )}
    {children}
  </section>
);

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
