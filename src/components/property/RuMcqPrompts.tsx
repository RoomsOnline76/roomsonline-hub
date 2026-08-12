import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, ArrowRight, CheckCircle2, Clock, Info } from "lucide-react";
import { CHANNEL_MANAGER } from "@/lib/channelVocabulary";
import { focusRequirementField } from "@/lib/requirementFocus";
import { getSectionLabel } from "@/config/propertySectionOrder";
import {
  explainOrderFailure,
  isPassResult,
  resolveMcqRequirement,
  type McqRequirement,
} from "@/lib/mcqRequirements";

/**
 * Owner-facing content quality prompts.
 *
 * The channel manager runs a minimum content quality check on every listing before
 * onboarding. Two very different things can go wrong and they are reported apart:
 *   1. the content failed the review — each failing point is matched to the exact
 *      requirement and deep-links to the field that fixes it;
 *   2. the check could not be placed at all (not subscribed, listing not pushed,
 *      channel not selected) — platform plumbing, never an owner to-do.
 *
 * A later "Eligible" review notification always wins over an older ordering error,
 * so a cleared wizard never keeps showing red. Vendor naming stays out of this
 * surface (see src/lib/channelVocabulary.ts).
 */

interface McqOrderRow {
  id: string;
  ru_property_id: string | null;
  status: string | null;
  ordered_at: string | null;
  response_preview: string | null;
}

interface Parsed {
  points: string[];
  result: string | null;
  orderError: string | null;
}

interface Prompt {
  listing: string;
  listingLabel: string;
  orderedAt: string | null;
  /** Content failures matched to requirements. */
  items: { point: string; requirement: McqRequirement | null }[];
}

interface Blocked {
  listing: string;
  listingLabel: string;
  title: string;
  detail: string;
}

function parseRow(raw: string | null): Parsed {
  if (!raw) return { points: [], result: null, orderError: null };
  try {
    const parsed = JSON.parse(raw);
    const note = parsed?.mcq_notification;
    const points: string[] = Array.isArray(note?.failing_points) ? note.failing_points : [];
    return {
      points,
      result: typeof note?.result === "string" ? note.result : null,
      orderError: typeof parsed?.error?.message === "string" ? parsed.error.message : null,
    };
  } catch {
    return { points: [], result: null, orderError: null };
  }
}

export function RuMcqPrompts({
  propertyId,
  /** Switch the local editor section instead of navigating (used inside the editor). */
  onNavigateSection,
}: {
  propertyId: string;
  onNavigateSection?: (section: string, focusKey?: string) => void;
}) {
  const navigate = useNavigate();
  const [, setSearchParams] = useSearchParams();
  const [rows, setRows] = useState<McqOrderRow[] | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [{ data }, { data: units }] = await Promise.all([
        supabase
          .from("ru_mcq_orders")
          .select("id, ru_property_id, status, ordered_at, response_preview")
          .eq("property_id", propertyId)
          .order("ordered_at", { ascending: false })
          .limit(40),
        supabase
          .from("hostfully_room_types")
          .select("name, rentalsunited_property_id")
          .eq("property_id", propertyId),
      ]);
      if (cancelled) return;
      setRows((data ?? []) as McqOrderRow[]);
      const map: Record<string, string> = {};
      for (const u of (units ?? []) as { name: string | null; rentalsunited_property_id: string | null }[]) {
        if (u.rentalsunited_property_id && u.name) map[String(u.rentalsunited_property_id)] = u.name;
      }
      setNames(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [propertyId]);

  /** Newest order per listing — an older pass must not mask a newer failure. */
  const newest = useMemo(() => {
    const byListing = new Map<string, McqOrderRow>();
    for (const r of rows ?? []) {
      const key = String(r.ru_property_id ?? "-");
      if (!byListing.has(key)) byListing.set(key, r);
    }
    return Array.from(byListing.values());
  }, [rows]);

  const labelFor = useCallback(
    (id: string | null) => (id && names[id]) || (id ? `Listing ${id}` : "Listing"),
    [names],
  );

  const { failing, blocked, pending, passed } = useMemo(() => {
    const failing: Prompt[] = [];
    const blocked: Blocked[] = [];
    let pending = 0;
    let passed = 0;

    for (const r of newest) {
      const listing = String(r.ru_property_id ?? "-");
      const listingLabel = labelFor(r.ru_property_id);
      const parsed = parseRow(r.response_preview);

      // A review notification always outranks the order-side status.
      if (isPassResult(parsed.result) && parsed.points.length === 0) {
        passed += 1;
        continue;
      }
      if (parsed.points.length > 0) {
        failing.push({
          listing,
          listingLabel,
          orderedAt: r.ordered_at,
          items: parsed.points.map((point) => ({ point, requirement: resolveMcqRequirement(point) })),
        });
        continue;
      }
      if (r.status === "passed") {
        passed += 1;
        continue;
      }
      if (r.status === "ordered") {
        pending += 1;
        continue;
      }
      if (r.status === "failed") {
        const explained = explainOrderFailure(parsed.orderError ?? parsed.result ?? "Unknown response");
        blocked.push({ listing, listingLabel, title: explained.title, detail: explained.detail });
      }
    }
    return { failing, blocked, pending, passed };
  }, [labelFor, newest]);

  const goToFix = useCallback(
    (req: McqRequirement) => {
      if (onNavigateSection) {
        onNavigateSection(req.section, req.focusKey);
      } else {
        setSearchParams(
          (prev) => {
            const next = new URLSearchParams(prev);
            next.set("section", req.section);
            if (req.focusKey) next.set("focus", req.focusKey);
            return next;
          },
          { replace: true },
        );
      }
      if (req.focusKey) window.setTimeout(() => focusRequirementField(req.focusKey!), 400);
    },
    [onNavigateSection, setSearchParams],
  );

  if (!rows || newest.length === 0) return null;

  const allClear = failing.length === 0 && blocked.length === 0 && pending === 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          Listing content quality
          {allClear && (
            <Badge variant="default" className="gap-1">
              <CheckCircle2 className="h-3 w-3" /> Approved
            </Badge>
          )}
          {failing.length > 0 && (
            <Badge variant="destructive" className="gap-1">
              <AlertTriangle className="h-3 w-3" /> {failing.length} listing
              {failing.length === 1 ? "" : "s"} to fix
            </Badge>
          )}
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          The {CHANNEL_MANAGER} reviews your listing content before it can be distributed. Each point below shows the
          exact requirement and takes you to the field that satisfies it.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {failing.map((prompt) => (
          <div key={prompt.listing} className="rounded-md border border-destructive/40 p-3">
            <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              {prompt.listingLabel}
              {prompt.orderedAt && (
                <span className="text-xs font-normal text-muted-foreground">
                  reviewed {new Date(prompt.orderedAt).toLocaleDateString()}
                </span>
              )}
            </p>
            <ul className="mt-2 space-y-2">
              {prompt.items.map(({ point, requirement }, i) => (
                <li key={i} className="rounded-md bg-muted/40 p-2">
                  <p className="text-xs font-medium text-foreground">{requirement?.title ?? point}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {requirement?.requirement ?? point}
                  </p>
                  {requirement && (
                    <Button
                      variant="link"
                      size="sm"
                      className="mt-1 h-auto gap-1 p-0 text-xs"
                      onClick={() => goToFix(requirement)}
                    >
                      Fix in {getSectionLabel(requirement.section) ?? requirement.section}
                      <ArrowRight className="h-3 w-3" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}

        {blocked.map((b) => (
          <div key={`blocked-${b.listing}`} className="rounded-md border border-border/60 p-3">
            <p className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Info className="h-4 w-4 text-muted-foreground" /> {b.title}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {b.listingLabel} — {b.detail}
            </p>
          </div>
        ))}

        {pending > 0 && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" /> {pending} listing{pending === 1 ? "" : "s"} awaiting the review result.
          </p>
        )}

        {failing.length === 0 && pending === 0 && passed > 0 && (
          <p className="text-xs text-muted-foreground">
            {passed} listing{passed === 1 ? "" : "s"} passed the content review — nothing to fix.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
