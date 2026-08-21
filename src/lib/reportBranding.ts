/**
 * Branding resolution for the Revenue Reports pack.
 *
 * A report can follow the property's own brand (as configured in ROL), the
 * Rooms Online house brand, or per-report custom values. Whatever the chosen
 * source resolves to is what gets saved into `property_report_settings`, so the
 * Excel and draft-report edge functions keep reading a single flat set of
 * values.
 */

export type ReportBrandSource = "property" | "rol" | "custom";

export const ROL_DEFAULT_BRAND = {
  primary: "#E91E8C",
  secondary: "#1A1A2E",
} as const;

export interface ReportBrandValues {
  logoUrl: string | null;
  primary: string;
  secondary: string;
}

export interface PropertyBrandInput {
  logoUrl?: string | null;
  primary?: string | null;
  secondary?: string | null;
}

const clean = (value?: string | null): string | null => {
  const trimmed = (value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
};

export function resolveReportBrand(
  source: ReportBrandSource,
  property: PropertyBrandInput | null | undefined,
  custom: PropertyBrandInput,
): ReportBrandValues {
  if (source === "rol") {
    return {
      logoUrl: null,
      primary: ROL_DEFAULT_BRAND.primary,
      secondary: ROL_DEFAULT_BRAND.secondary,
    };
  }

  if (source === "property") {
    return {
      logoUrl: clean(property?.logoUrl),
      primary: clean(property?.primary) ?? ROL_DEFAULT_BRAND.primary,
      secondary: clean(property?.secondary) ?? ROL_DEFAULT_BRAND.secondary,
    };
  }

  return {
    logoUrl: clean(custom.logoUrl),
    primary: clean(custom.primary) ?? ROL_DEFAULT_BRAND.primary,
    secondary: clean(custom.secondary) ?? ROL_DEFAULT_BRAND.secondary,
  };
}

export const REPORT_BRAND_SOURCE_LABEL: Record<ReportBrandSource, string> = {
  property: "Property branding",
  rol: "Rooms Online default",
  custom: "Custom",
};
