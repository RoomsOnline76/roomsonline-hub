/**
 * Revenue Reports source-adapter contract (Design Brief §11).
 *
 * An adapter describes *everything* that is source-specific about a revenue
 * report run: which edge parser reads the files, which columns those files must
 * contain, which manual monthly inputs the reviewer is asked for, and which
 * final visual template the pack uses. Everything downstream — the aggregation
 * engine, snapshot model, Excel builder, AI insights — is source agnostic.
 */

export type ReportSourceKey = "nightsbridge" | "opera" | "protel";

/** Readiness of the adapter. `planned` adapters are visible but cannot process. */
export type ReportSourceStatus = "ready" | "planned";

/** Which final visual layout the report pack uses. PROTEL diverges. */
export type ReportTemplate = "standard" | "protel";

/** A single manual monthly input the reviewer fills in on the review page. */
export interface AdditionalFieldDescriptor {
  /** Column on `report_additional_inputs` holding the per-month JSON map. */
  key: "dinner_by_month" | "room0_by_month" | "comp_rns_by_month";
  label: string;
  /** Short helper copy shown under the field. */
  hint: string;
  /** Value kind — drives formatting in the review grid. */
  kind: "currency" | "count";
}

/** Default manual-input configuration for a source. */
export interface AdditionalFieldConfig {
  monthly: AdditionalFieldDescriptor[];
  /** Free-text narrative blocks captured on the wizard's notes step. */
  narrative: ("minStay" | "promotions" | "rateOverrides" | "commentary")[];
}

export interface ReportSourceAdapter {
  key: ReportSourceKey;
  label: string;
  /** One-line description of the export the parser expects. */
  description: string;
  status: ReportSourceStatus;
  /** Supabase edge function that parses this source's files. */
  parserFunction: string;
  /** Final report layout to render for runs of this source. */
  reportTemplate: ReportTemplate;
  /** File extensions the drop zone should accept. */
  acceptedFileTypes: string[];
  /** Columns the uploaded workbook must expose (lower-case, canonical). */
  getExpectedColumns(): string[];
  /** Manual inputs collected for runs of this source. */
  getDefaultAdditionalFields(): AdditionalFieldConfig;
  /** Shown in the UI for `planned` adapters — what is still outstanding. */
  notes?: string;
}
