import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Search, Loader2, CheckCircle2, AlertTriangle, Sparkles, List } from "lucide-react";
import {
  RU_MIN_ROOM_AMENITIES,
  RuAmenity,
  groupRuAmenities,
  ruToken,
  splitAmenityValues,
} from "@/lib/ruAmenities";

interface RUAmenityPickerProps {
  /** Stored amenity values for the room type (`ru:<id>` tokens and/or legacy labels). */
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}

/**
 * Grouped, searchable amenity selector driven by Rentals United's live amenity
 * dictionary. Leads with the recommended set, exposes the full catalogue on demand
 * and enforces RU's 10-amenity-per-unit submission minimum.
 */
export default function RUAmenityPicker({ value, onChange, disabled }: RUAmenityPickerProps) {
  const [catalogue, setCatalogue] = useState<RuAmenity[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("ru_amenities")
        .select("id, name, category, is_recommended")
        .eq("is_active", true)
        .order("name");
      if (cancelled) return;
      setCatalogue((data ?? []) as RuAmenity[]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const { ids: selectedIds, legacy } = useMemo(() => splitAmenityValues(value ?? []), [value]);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const toggle = useCallback((id: number, checked: boolean) => {
    const token = ruToken(id);
    const others = (value ?? []).filter((v) => v !== token);
    onChange(checked ? [...others, token] : others);
  }, [onChange, value]);

  const removeLegacy = useCallback((label: string) => {
    onChange((value ?? []).filter((v) => v !== label));
  }, [onChange, value]);

  const query = search.trim().toLowerCase();
  const visible = useMemo(() => {
    return catalogue.filter((a) => {
      if (query) return a.name.toLowerCase().includes(query);
      if (showAll) return true;
      return a.is_recommended || selectedSet.has(a.id);
    });
  }, [catalogue, query, showAll, selectedSet]);

  const groups = useMemo(() => groupRuAmenities(visible), [visible]);
  const count = selectedIds.length;
  const meetsMinimum = count >= RU_MIN_ROOM_AMENITIES;

  return (
    <div className="space-y-4">
      {/* Counter */}
      <div className="rounded-md border p-3 space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm">
            {meetsMinimum ? (
              <CheckCircle2 className="h-4 w-4 text-success" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-warning" />
            )}
            <span className="font-medium">
              {count} of {RU_MIN_ROOM_AMENITIES} minimum amenities selected
            </span>
          </div>
          <Badge variant={meetsMinimum ? "secondary" : "outline"} className="text-xs">
            {meetsMinimum ? "Channel-ready" : "Below channel minimum"}
          </Badge>
        </div>
        <Progress value={Math.min(100, (count / RU_MIN_ROOM_AMENITIES) * 100)} className="h-1.5" />
        <p className="text-xs text-muted-foreground">
          Channel partners (Rentals United and downstream OTAs) require at least{" "}
          {RU_MIN_ROOM_AMENITIES} amenities per unit before the listing can be submitted.
        </p>
      </div>

      {/* Legacy labels that don't map to the channel catalogue */}
      {legacy.length > 0 && (
        <Alert>
          <AlertDescription className="space-y-2 text-xs">
            <span>
              {legacy.length} older free-text amenity label(s) are still stored. They are matched to
              channel amenities where possible — re-pick them below to be certain.
            </span>
            <div className="flex flex-wrap gap-1">
              {legacy.map((label) => (
                <Badge key={label} variant="outline" className="text-xs gap-1">
                  {label}
                  {!disabled && (
                    <button type="button" onClick={() => removeLegacy(label)} className="opacity-60 hover:opacity-100">
                      ×
                    </button>
                  )}
                </Badge>
              ))}
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search all channel amenities…"
            className="pl-7 h-9 text-sm"
          />
        </div>
        <Button
          type="button"
          variant={showAll ? "default" : "outline"}
          size="sm"
          onClick={() => setShowAll((v) => !v)}
          className="h-9 gap-1.5 text-xs"
        >
          {showAll ? <Sparkles className="h-3.5 w-3.5" /> : <List className="h-3.5 w-3.5" />}
          {showAll ? "Show recommended only" : `Show full catalogue (${catalogue.length})`}
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading amenity catalogue…
        </div>
      ) : groups.length === 0 ? (
        <p className="p-6 text-sm text-muted-foreground">No amenities match “{search}”.</p>
      ) : (
        <ScrollArea className="h-[520px] pr-3">
          <div className="space-y-5">
            {groups.map((group) => (
              <div key={group.category} className="space-y-2">
                <div className="flex items-center gap-2">
                  <h4 className="font-semibold text-sm">{group.category}</h4>
                  <Badge variant="outline" className="text-[10px]">{group.items.length}</Badge>
                </div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {group.items.map((a) => (
                    <div key={a.id} className="flex items-start gap-2">
                      <Checkbox
                        id={`ru-amenity-${a.id}`}
                        disabled={disabled}
                        checked={selectedSet.has(a.id)}
                        onCheckedChange={(checked) => toggle(a.id, checked === true)}
                      />
                      <Label
                        htmlFor={`ru-amenity-${a.id}`}
                        className="text-sm leading-tight cursor-pointer flex-1"
                      >
                        {a.name}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
