/**
 * "Last sent to Rentals United" — makes company-profile drift visible.
 *
 * Phase 1 stores the exact payload it submitted (`ru_owner_accounts.company_payload`).
 * Comparing it against the profile currently captured in ROLOS is the only way to
 * see that RU still holds an older value (a stale phone, a missing VAT number, a
 * count where a range ID belongs) without opening the RU portal.
 */
import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Check, Minus, Send } from "lucide-react";
import {
  RU_EMPLOYEE_RANGES,
  RU_PROPERTY_RANGES,
  RU_YEARS_RANGES,
  rangeLabel,
  type RuRange,
} from "@/lib/ruRanges";

type Json = Record<string, unknown> | null | undefined;

interface FieldSpec {
  /** Key inside the sent payload. */
  key: string;
  label: string;
  /** Key inside the ROLOS `company_profile` object, when it differs. */
  profileKey?: string;
  ranges?: RuRange[];
}

const FIELDS: FieldSpec[] = [
  { key: "first_name", label: "Contact first name", profileKey: "contact_first_name" },
  { key: "last_name", label: "Contact last name", profileKey: "contact_last_name" },
  { key: "phone", label: "Contact phone", profileKey: "contact_phone" },
  { key: "birth_date", label: "Contact date of birth", profileKey: "contact_birth_date" },
  { key: "email", label: "Contact email" },
  { key: "name", label: "Company name" },
  { key: "company_address", label: "Company address" },
  { key: "company_city", label: "Company city" },
  { key: "post_code", label: "Postal code" },
  { key: "region", label: "Region" },
  { key: "time_zone", label: "Time zone" },
  { key: "vat_number", label: "VAT number" },
  { key: "manager_identification_number", label: "Company registration / manager ID" },
  { key: "merchant_name", label: "Merchant name" },
  { key: "number_of_properties", label: "Number of properties", ranges: RU_PROPERTY_RANGES },
  { key: "number_of_employees", label: "Number of employees", ranges: RU_EMPLOYEE_RANGES },
  { key: "years_in_business", label: "Years in business", ranges: RU_YEARS_RANGES },
  { key: "describe_your_business", label: "Business description" },
];

const norm = (v: unknown) =>
  v === null || v === undefined ? "" : String(v).replace(/\s+/g, " ").trim();

function display(value: unknown, ranges?: RuRange[]) {
  const raw = norm(value);
  if (!raw) return "";
  if (ranges) return rangeLabel(ranges, raw) || raw;
  return raw;
}

export function RuLastSentPanel({
  sentPayload,
  currentProfile,
  sentAt,
}: {
  sentPayload: Json;
  currentProfile: Json;
  sentAt?: string | null;
}) {
  const rows = useMemo(() => {
    const sent = (sentPayload ?? {}) as Record<string, unknown>;
    const cur = (currentProfile ?? {}) as Record<string, unknown>;
    return FIELDS.map((f) => {
      const sentVal = display(sent[f.key], f.ranges);
      const curRaw = cur[f.profileKey ?? f.key] ?? sent[f.key];
      const curVal = display(curRaw, f.ranges);
      let state: "match" | "drift" | "missing" = "match";
      if (!sentVal && !curVal) state = "missing";
      else if (sentVal.toLowerCase() !== curVal.toLowerCase()) state = "drift";
      return { ...f, sentVal, curVal, state };
    });
  }, [sentPayload, currentProfile]);

  const drift = rows.filter((r) => r.state === "drift").length;
  const missing = rows.filter((r) => r.state === "missing").length;

  if (!sentPayload) {
    return (
      <div className="rounded-md border border-border bg-muted/20 p-3">
        <p className="text-xs font-medium flex items-center gap-1.5">
          <Send className="h-3.5 w-3.5 text-muted-foreground" />
          Last sent to Rentals United
        </p>
        <p className="text-[11px] text-muted-foreground mt-1">
          No company payload recorded yet. Run Phase 1 (company details) to push the profile and
          capture a comparison baseline.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-border bg-muted/20 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs font-medium flex items-center gap-1.5">
          <Send className="h-3.5 w-3.5 text-muted-foreground" />
          Last sent to Rentals United
          {sentAt && (
            <span className="text-[10px] text-muted-foreground font-normal">
              · {new Date(sentAt).toLocaleString()}
            </span>
          )}
        </p>
        <div className="flex items-center gap-1.5">
          {drift > 0 ? (
            <Badge variant="outline" className="text-[10px] text-amber-700 border-amber-500/50 dark:text-amber-300">
              {drift} field{drift === 1 ? "" : "s"} changed since push
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[10px] text-success border-success/40">
              In sync
            </Badge>
          )}
          {missing > 0 && (
            <Badge variant="outline" className="text-[10px] text-muted-foreground">
              {missing} not captured
            </Badge>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-muted-foreground text-left">
              <th className="py-1 pr-2 font-medium">Field</th>
              <th className="py-1 pr-2 font-medium">At Rentals United</th>
              <th className="py-1 pr-2 font-medium">In ROLOS now</th>
              <th className="py-1 font-medium w-6" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-t border-border/60 align-top">
                <td className="py-1 pr-2">{r.label}</td>
                <td className="py-1 pr-2 text-muted-foreground break-all">{r.sentVal || "—"}</td>
                <td
                  className={`py-1 pr-2 break-all ${
                    r.state === "drift" ? "text-amber-700 dark:text-amber-300 font-medium" : "text-muted-foreground"
                  }`}
                >
                  {r.curVal || "—"}
                </td>
                <td className="py-1">
                  {r.state === "drift" ? (
                    <AlertTriangle className="h-3 w-3 text-amber-600 dark:text-amber-400" />
                  ) : r.state === "missing" ? (
                    <Minus className="h-3 w-3 text-muted-foreground" />
                  ) : (
                    <Check className="h-3 w-3 text-success" />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {drift > 0 && (
        <p className="text-[10px] text-muted-foreground">
          Re-run Phase 1 (company details) to push the current ROLOS values to Rentals United.
        </p>
      )}
    </div>
  );
}
