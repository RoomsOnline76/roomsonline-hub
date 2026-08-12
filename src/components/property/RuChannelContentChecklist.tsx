import React, { useCallback, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, AlertTriangle, XCircle, Clock, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { getSectionLabel } from "@/config/propertySectionOrder";
import { focusRequirementField } from "@/lib/requirementFocus";
import { usePropertyReadiness, type ReadinessItem } from "@/hooks/usePropertyReadiness";

/**
 * Channel content checklist.
 *
 * Rows are NOT authored here — they are rendered from the unified readiness model
 * (`evaluateRequirements`), the same truth that drives the score badge, the pink
 * field borders and the server-side push gate. That means this card can never
 * report "All confirmed" while a real blocker is outstanding.
 *
 * The push dry-run flags below are an OVERLAY only: they can turn a satisfied row
 * amber ("a fallback value is being pushed — confirm it"), never turn an
 * unsatisfied row green.
 */
export interface RuContentFlags {
  has_name?: boolean;
  has_object_type_id?: boolean;
  can_sleep_max_ok?: boolean;
  has_floor?: boolean;
  floor_is_default?: boolean;
  has_space?: boolean;
  space_is_default?: boolean;
  has_street?: boolean;
  has_detailed_location_id?: boolean;
  has_zip_code?: boolean;
  has_coordinates?: boolean;
  amenities_count?: number;
  meets_minimum_amenities?: boolean;
  amenities_padded?: boolean;
  rooms_count?: number;
  total_beds?: number;
  total_bed_capacity?: number;
  max_guests?: number;
  beds_meet_max_guests?: boolean;
  has_description?: boolean;
  images_count?: number;
  meets_minimum_images?: boolean;
  has_main_image?: boolean;
  has_payment_methods?: boolean;
  payment_methods_is_default?: boolean;
  has_cancellation_policies?: boolean;
  cancellation_policies_is_default?: boolean;
}

type State = "ok" | "fallback" | "pending" | "missing";

/**
 * Push-time fallbacks mapped to the requirement keys they stand in for. When the
 * push reports a fallback, the (satisfied) row is flagged for confirmation.
 */
const FALLBACK_OVERLAY: Array<{ flag: keyof RuContentFlags; keys: string[]; note: string }> = [
  { flag: "floor_is_default", keys: ["property_floor", "room_floors"], note: "Fallback 0 (ground) pushed — confirm" },
  { flag: "space_is_default", keys: ["property_size_sqm", "room_size"], note: "Fallback 50 m² pushed — confirm" },
  { flag: "amenities_padded", keys: ["facilities"], note: "Auto-filled to reach 10 — confirm" },
  { flag: "payment_methods_is_default", keys: ["payment_methods"], note: "Cash + card assumed — confirm" },
  {
    flag: "cancellation_policies_is_default",
    keys: ["master_policy"],
    note: "Standard default assumed — confirm",
  },
];

/** Rows the browser cannot compute; they wait on the channel report. */
const CHANNEL_REPORTED_KEYS = new Set(["bookable_window", "min_stay_set", "room_kitchen"]);

/** Sections that live only in the admin property editor. */
const ADMIN_ONLY_SECTIONS = new Set(["admin", "integrations", "branding", "rol-spec"]);

interface Props {
  propertyId: string;
  /** Optional dry-run flags from the last push attempt (overlay only). */
  validation?: RuContentFlags | null;
  /** Switches the local editor section when a row is clicked. */
  onNavigateSection?: (section: string) => void;
}

export const RuChannelContentChecklist: React.FC<Props> = ({
  propertyId,
  validation,
  onNavigateSection,
}) => {
  const navigate = useNavigate();
  const [, setSearchParams] = useSearchParams();
  const { items, subject, isLoading, hasData } = usePropertyReadiness(propertyId);

  /** Requirement key → confirmation note, from the push dry-run flags. */
  const fallbackNotes = useMemo(() => {
    const map = new Map<string, string>();
    if (!validation) return map;
    for (const entry of FALLBACK_OVERLAY) {
      if (validation[entry.flag] !== true) continue;
      for (const key of entry.keys) map.set(key, entry.note);
    }
    return map;
  }, [validation]);

  const channelReportPending = useMemo(
    () => !subject?.channel_checks || Object.keys(subject.channel_checks).length === 0,
    [subject],
  );

  const rows = useMemo(() => {
    const stateFor = (item: ReadinessItem): State => {
      if (!item.satisfied) return "missing";
      if (channelReportPending && CHANNEL_REPORTED_KEYS.has(item.key)) return "pending";
      if (fallbackNotes.has(item.key)) return "fallback";
      return "ok";
    };
    const decorate = (list: ReadinessItem[]) =>
      list
        .map((item) => ({ item, state: stateFor(item) }))
        .sort((a, b) => {
          const rank = (s: State) => (s === "missing" ? 0 : s === "fallback" ? 1 : s === "pending" ? 2 : 3);
          return rank(a.state) - rank(b.state);
        });
    return {
      mandatory: decorate(items.filter((i) => i.tier === "mandatory")),
      recommended: decorate(items.filter((i) => i.tier === "recommended")),
    };
  }, [channelReportPending, fallbackNotes, items]);

  const all = [...rows.mandatory, ...rows.recommended];
  const missingMandatory = rows.mandatory.filter((r) => r.state === "missing").length;
  const missingRecommended = rows.recommended.filter((r) => r.state === "missing").length;
  const fallbacks = all.filter((r) => r.state === "fallback").length;
  const pending = all.filter((r) => r.state === "pending").length;

  const goToFix = useCallback(
    (item: ReadinessItem) => {
      const section = item.section;
      if (!section) return;
      const focusKey = item.paintable ? item.key : undefined;
      if (item.surface === "admin" || ADMIN_ONLY_SECTIONS.has(section)) {
        navigate(`/admin/properties/${propertyId}?tab=${section}${focusKey ? `&focus=${focusKey}` : ""}`);
        return;
      }
      if (onNavigateSection) {
        onNavigateSection(section);
      } else {
        setSearchParams(
          (prev) => {
            const next = new URLSearchParams(prev);
            next.set("section", section);
            if (focusKey) next.set("focus", focusKey);
            return next;
          },
          { replace: true },
        );
      }
      if (focusKey) window.setTimeout(() => focusRequirementField(focusKey), 350);
    },
    [navigate, onNavigateSection, propertyId, setSearchParams],
  );

  if (isLoading || !hasData) {
    return (
      <div className="rounded-md border border-border px-3 py-3 flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Scoring channel content requirements…
      </div>
    );
  }

  const renderRow = ({ item, state }: { item: ReadinessItem; state: State }) => {
    const note =
      state === "fallback"
        ? fallbackNotes.get(item.key)
        : state === "pending"
          ? "Awaiting channel report"
          : undefined;
    return (
      <button
        key={item.key}
        type="button"
        onClick={() => goToFix(item)}
        className="w-full text-left flex items-start justify-between gap-2 px-3 py-1.5 hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-start gap-2 min-w-0">
          {state === "ok" && <CheckCircle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-foreground" />}
          {state === "fallback" && <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary" />}
          {state === "pending" && <Clock className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />}
          {state === "missing" && <XCircle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-destructive" />}
          <div className="min-w-0">
            <p className={cn("text-xs font-medium truncate", state === "missing" && "text-destructive")}>
              {item.label}
            </p>
            <p className="text-[10px] text-muted-foreground truncate">
              {item.sectionLabel ?? getSectionLabel(item.section)}
              {state === "missing" && (item.hint || item.message)
                ? ` · ${item.hint ?? item.message}`
                : ""}
            </p>
          </div>
        </div>
        {note && (
          <span className="text-[10px] text-muted-foreground text-right shrink-0 max-w-[40%]">{note}</span>
        )}
      </button>
    );
  };

  return (
    <div className="rounded-md border border-border">
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border">
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
          Channel-connection content ({all.length} requirements)
        </p>
        <div className="flex items-center gap-1 flex-wrap justify-end">
          {missingMandatory > 0 && (
            <Badge variant="destructive" className="text-[10px] h-5">
              {missingMandatory} blocking
            </Badge>
          )}
          {missingRecommended > 0 && (
            <Badge variant="outline" className="text-[10px] h-5">
              {missingRecommended} nice-to-have
            </Badge>
          )}
          {fallbacks > 0 && (
            <Badge variant="outline" className="text-[10px] h-5 border-primary text-primary">
              {fallbacks} unconfirmed
            </Badge>
          )}
          {pending > 0 && (
            <Badge variant="outline" className="text-[10px] h-5">
              {pending} pending
            </Badge>
          )}
          {missingMandatory === 0 && missingRecommended === 0 && fallbacks === 0 && pending === 0 && (
            <Badge variant="secondary" className="text-[10px] h-5">
              All confirmed
            </Badge>
          )}
        </div>
      </div>

      <div className="divide-y divide-border">
        <p className="px-3 py-1 text-[10px] uppercase tracking-wider text-muted-foreground bg-muted/40">
          Required by the channel ({rows.mandatory.length})
        </p>
        {rows.mandatory.map(renderRow)}
        {rows.recommended.length > 0 && (
          <p className="px-3 py-1 text-[10px] uppercase tracking-wider text-muted-foreground bg-muted/40">
            Recommended ({rows.recommended.length})
          </p>
        )}
        {rows.recommended.map(renderRow)}
      </div>
    </div>
  );
};
