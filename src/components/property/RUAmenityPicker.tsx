import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { isKitchenFamilyId, withSingleKitchenFlavour } from "@/lib/ruKitchen";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Search, Loader2, CheckCircle2, AlertTriangle, List, Sparkles, ChevronDown } from "lucide-react";
import {
  RU_MIN_ROOM_AMENITIES,
  RuAmenity,
  groupByRuGroup,
  groupRuAmenities,
  inScope,
  ruToken,
  splitAmenityValues,
} from "@/lib/ruAmenities";

export interface ExtraAmenityGroup {
  /** Section heading, e.g. "Activities & Experiences". */
  title: string;
  /** Free-text labels that have no Rentals United equivalent (ROLOS website only). */
  items: string[];
}

interface RUAmenityPickerProps {
  /** Stored amenity values (`ru:<id>` / `ru:<id>:<count>` tokens and/or free-text labels). */
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  /** Which catalogue slice to offer. Defaults to unit/room level. */
  scope?: "unit" | "property";
  /** Channel minimum shown in the readiness meter. Pass 0 to hide the meter. */
  minimum?: number;
  /** ROLOS-only facilities with no RU mapping, shown in their own section. */
  extraGroups?: ExtraAmenityGroup[];
}

/**
 * Grouped, searchable amenity selector driven by Rentals United's live amenity
 * dictionary. Leads with RU's own "Popular amenities" block, then RU's groups,
 * then the full catalogue on demand, and finally any ROLOS-only extras.
 */
export default function RUAmenityPicker({
  value,
  onChange,
  disabled,
  scope = "unit",
  minimum,
  extraGroups,
}: RUAmenityPickerProps) {
  const min = minimum ?? (scope === "unit" ? RU_MIN_ROOM_AMENITIES : 0);
  const [catalogue, setCatalogue] = useState<RuAmenity[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // The RU dictionary is larger than PostgREST's default 1000-row window, so page it.
      const page = 1000;
      const all: RuAmenity[] = [];
      for (let from = 0; from < 10000; from += page) {
        const { data, error } = await supabase
          .from("ru_amenities")
          .select("id, name, category, is_recommended, scope, popular_rank, ru_group, supports_count")
          .eq("is_active", true)
          .order("name")
          .range(from, from + page - 1);
        if (error || !data || data.length === 0) break;
        all.push(...(data as RuAmenity[]));
        if (data.length < page) break;
      }
      if (cancelled) return;
      setCatalogue(all);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const { ids: selectedIds, counts, legacy } = useMemo(
    () => splitAmenityValues(value ?? []),
    [value],
  );
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const extraLabels = useMemo(
    () => new Set((extraGroups ?? []).flatMap((g) => g.items)),
    [extraGroups],
  );
  /** Free-text labels that are neither RU tokens nor known ROLOS-only options. */
  const orphanLabels = useMemo(
    () => legacy.filter((l) => !extraLabels.has(l)),
    [legacy, extraLabels],
  );

  const setToken = useCallback((id: number, checked: boolean, count = 1) => {
    // Kitchen flavours are mutually exclusive — ticking "kitchenette" must clear
    // "Separate kitchen", otherwise the channel keeps publishing the old flavour.
    const base = checked && isKitchenFamilyId(id)
      ? withSingleKitchenFlavour(value ?? [], id)
      : (value ?? []);
    const others = base.filter((v) => {
      const m = v.match(/^ru:(\d+)(?::\d+)?$/i);
      return !m || parseInt(m[1], 10) !== id;
    });
    onChange(checked ? [...others, ruToken(id, count)] : others);
  }, [onChange, value]);

  const toggleLabel = useCallback((label: string, checked: boolean) => {
    const others = (value ?? []).filter((v) => v !== label);
    onChange(checked ? [...others, label] : others);
  }, [onChange, value]);

  const scoped = useMemo(() => catalogue.filter((a) => inScope(a, scope)), [catalogue, scope]);
  const popular = useMemo(
    () => scoped.filter((a) => a.popular_rank != null)
      .sort((a, b) => (a.popular_rank ?? 0) - (b.popular_rank ?? 0)),
    [scoped],
  );
  const ruGroups = useMemo(
    () => groupByRuGroup(scoped.filter((a) => a.popular_rank == null && a.ru_group)),
    [scoped],
  );

  const query = search.trim().toLowerCase();
  const browseList = useMemo(() => {
    if (query) return scoped.filter((a) => a.name.toLowerCase().includes(query));
    if (showAll) return scoped.filter((a) => a.popular_rank == null && !a.ru_group);
    return scoped.filter(
      (a) => a.popular_rank == null && !a.ru_group && (a.is_recommended || selectedSet.has(a.id)),
    );
  }, [scoped, query, showAll, selectedSet]);
  const browseGroups = useMemo(() => groupRuAmenities(browseList), [browseList]);

  const count = selectedIds.length;
  const meetsMinimum = min === 0 || count >= min;
  const selectedSummary = useMemo(
    () => groupRuAmenities(catalogue.filter((a) => selectedSet.has(a.id))),
    [catalogue, selectedSet],
  );

  const renderCheckbox = (a: RuAmenity) => {
    const checked = selectedSet.has(a.id);
    return (
      <div key={a.id} className="flex items-center gap-1.5">
        <Checkbox
          id={`ru-amenity-${scope}-${a.id}`}
          className="h-3.5 w-3.5"
          disabled={disabled}
          checked={checked}
          onCheckedChange={(c) => setToken(a.id, c === true, counts[a.id] ?? 1)}
        />
        <Label
          htmlFor={`ru-amenity-${scope}-${a.id}`}
          className="text-xs leading-tight cursor-pointer flex-1"
        >
          {a.name}
        </Label>
        {a.supports_count && checked && (
          <Input
            type="number"
            min={1}
            aria-label={`${a.name} quantity`}
            value={counts[a.id] ?? 1}
            disabled={disabled}
            onChange={(e) => setToken(a.id, true, Math.max(1, parseInt(e.target.value) || 1))}
            className="h-6 w-14 text-xs px-1.5"
          />
        )}
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {/* Readiness meter */}
      {min > 0 && (
        <div className="rounded-md border px-3 py-2 space-y-1.5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs">
              {meetsMinimum ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-success" />
              ) : (
                <AlertTriangle className="h-3.5 w-3.5 text-warning" />
              )}
              <span className="font-medium">{count} of {min} minimum channel amenities selected</span>
            </div>
            <Badge variant={meetsMinimum ? "secondary" : "outline"} className="text-[10px]">
              {meetsMinimum ? "Channel-ready" : "Below channel minimum"}
            </Badge>
          </div>
          <Progress value={Math.min(100, (count / min) * 100)} className="h-1.5" />
        </div>
      )}

      {/* RU popular amenities — always first */}
      <div className="rounded-md border">
        <div className="flex items-center gap-2 border-b px-3 py-1.5">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          <h4 className="text-xs font-semibold uppercase tracking-wide">Popular amenities</h4>
          <Badge variant="outline" className="text-[10px]">Channel priority</Badge>
        </div>
        <div className="grid gap-x-4 gap-y-1.5 p-3 sm:grid-cols-2 lg:grid-cols-3">
          {loading ? (
            <div className="col-span-full flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading catalogue…
            </div>
          ) : (
            popular.map(renderCheckbox)
          )}
        </div>
      </div>

      {/* RU's own groups (Security & Safety, Policies, Accessibility …) */}
      {ruGroups.map((g) => (
        <div key={g.group} className="rounded-md border">
          <div className="flex items-center gap-2 border-b px-3 py-1.5">
            <h4 className="text-xs font-semibold uppercase tracking-wide">{g.group}</h4>
            <Badge variant="outline" className="text-[10px]">{g.items.length}</Badge>
          </div>
          <div className="grid gap-x-4 gap-y-1.5 p-3 sm:grid-cols-2 lg:grid-cols-3">
            {g.items.map(renderCheckbox)}
          </div>
        </div>
      ))}

      {/* Selected summary */}
      <Collapsible open={summaryOpen} onOpenChange={setSummaryOpen}>
        <div className="rounded-md border">
          <CollapsibleTrigger asChild>
            <button type="button" className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left">
              <span className="text-xs font-medium">
                Selected amenities summary ({count + legacy.length})
              </span>
              <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${summaryOpen ? "rotate-180" : ""}`} />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="border-t p-3 space-y-2">
              {selectedSummary.length === 0 && legacy.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nothing selected yet.</p>
              ) : (
                <>
                  {selectedSummary.map((group) => (
                    <div key={group.category} className="space-y-1">
                      <h5 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {group.category}
                      </h5>
                      <div className="flex flex-wrap gap-1">
                        {group.items.map((a) => (
                          <Badge key={a.id} variant="secondary" className="text-[10px] gap-1">
                            {a.name}{(counts[a.id] ?? 1) > 1 ? ` ×${counts[a.id]}` : ""}
                            {!disabled && (
                              <button type="button" onClick={() => setToken(a.id, false)} className="opacity-60 hover:opacity-100" aria-label={`Remove ${a.name}`}>×</button>
                            )}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ))}
                  {legacy.length > 0 && (
                    <div className="space-y-1">
                      <h5 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Website-only labels
                      </h5>
                      <div className="flex flex-wrap gap-1">
                        {legacy.map((label) => (
                          <Badge key={label} variant="outline" className="text-[10px]">{label}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>

      {/* Unmapped free-text labels */}
      {orphanLabels.length > 0 && (
        <Alert>
          <AlertDescription className="space-y-2 text-xs">
            <span>
              {orphanLabels.length} older free-text label(s) are still stored. They are matched to
              channel amenities where possible — re-pick them above to be certain.
            </span>
            <div className="flex flex-wrap gap-1">
              {orphanLabels.map((label) => (
                <Badge key={label} variant="outline" className="text-[10px] gap-1">
                  {label}
                  {!disabled && (
                    <button type="button" onClick={() => toggleLabel(label, false)} className="opacity-60 hover:opacity-100">×</button>
                  )}
                </Badge>
              ))}
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Full catalogue browse / search */}
      <div className="rounded-md border">
        <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search all channel amenities…"
              className="pl-7 h-7 text-xs"
            />
          </div>
          <Button
            type="button"
            variant={showAll ? "default" : "outline"}
            size="sm"
            onClick={() => setShowAll((v) => !v)}
            className="h-7 gap-1.5 text-[11px]"
          >
            <List className="h-3.5 w-3.5" />
            {showAll ? "Show recommended only" : `Show full catalogue (${scoped.length})`}
          </Button>
        </div>
        {loading ? (
          <div className="flex items-center gap-2 p-4 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading amenity catalogue…
          </div>
        ) : browseGroups.length === 0 ? (
          <p className="p-4 text-xs text-muted-foreground">
            {query ? `No amenities match “${search}”.` : "Nothing else to show — use the search or full catalogue."}
          </p>
        ) : (
          <ScrollArea className="h-[380px] px-3 py-2">
            <div className="space-y-3">
              {browseGroups.map((group) => (
                <div key={group.category} className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs font-semibold">{group.category}</h4>
                    <Badge variant="outline" className="text-[10px]">{group.items.length}</Badge>
                  </div>
                  <div className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
                    {group.items.map(renderCheckbox)}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </div>

      {/* ROLOS-only extras (no RU equivalent) */}
      {extraGroups && extraGroups.length > 0 && (
        <div className="rounded-md border">
          <div className="flex items-center gap-2 border-b px-3 py-1.5">
            <h4 className="text-xs font-semibold uppercase tracking-wide">ROLOS website only</h4>
            <Badge variant="outline" className="text-[10px]">Not sent to channels</Badge>
          </div>
          <div className="grid gap-4 p-3 sm:grid-cols-2 lg:grid-cols-4">
            {extraGroups.map((g) => (
              <div key={g.title} className="space-y-1">
                <h5 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {g.title}
                </h5>
                {g.items.map((label) => (
                  <div key={label} className="flex items-center gap-1.5">
                    <Checkbox
                      id={`extra-${scope}-${label}`}
                      className="h-3.5 w-3.5"
                      disabled={disabled}
                      checked={(value ?? []).includes(label)}
                      onCheckedChange={(c) => toggleLabel(label, c === true)}
                    />
                    <Label htmlFor={`extra-${scope}-${label}`} className="text-xs leading-tight cursor-pointer">
                      {label}
                    </Label>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
