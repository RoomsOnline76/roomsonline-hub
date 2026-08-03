import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Check, ChevronsUpDown, Loader2, MapPin, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/**
 * Rentals United location register picker.
 *
 * Reads the cached RU location tree in `public.ru_locations` (seeded from
 * Pull_ListLocations_RQ) so a property, a company address or a legal
 * representative can carry a genuine RU LocationID that pushes as-is instead of
 * being guessed from a name at push time.
 */
export interface RuLocation {
  id: number;
  name: string;
  path: string | null;
  country: string | null;
  currency_iso: string | null;
  location_type_id: number | null;
  depth: number | null;
}

export const RU_LOCATION_TYPE_LABEL: Record<number, string> = {
  1: "Country",
  2: "Region",
  3: "City",
  4: "City",
  5: "Neighbourhood",
};

interface Props {
  value: number | null;
  onChange: (id: number | null, location: RuLocation | null) => void;
  /** Restrict the list to these RU LocationTypeIDs (e.g. [1] for countries only). */
  typeFilter?: number[];
  placeholder?: string;
  /** Pre-seed the search box, e.g. with the property's city. */
  initialQuery?: string;
  className?: string;
  disabled?: boolean;
  /** Show the "Refresh register" action (admin surfaces only). */
  allowRefresh?: boolean;
}

export function RuLocationPicker({
  value,
  onChange,
  typeFilter,
  placeholder = "Search Rentals United locations…",
  initialQuery = "",
  className,
  disabled,
  allowRefresh = true,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(initialQuery);
  const [rows, setRows] = useState<RuLocation[]>([]);
  const [selected, setSelected] = useState<RuLocation | null>(null);
  const [loading, setLoading] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [emptyRegister, setEmptyRegister] = useState(false);

  const columns = "id, name, path, country, currency_iso, location_type_id, depth";

  // Resolve the label for the currently stored ID.
  useEffect(() => {
    let cancelled = false;
    if (!value) {
      setSelected(null);
      return;
    }
    void (async () => {
      const { data } = await supabase.from("ru_locations").select(columns).eq("id", value).maybeSingle();
      if (!cancelled) setSelected((data as RuLocation | null) ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [value]);

  const search = useCallback(
    async (term: string) => {
      setLoading(true);
      let q = supabase.from("ru_locations").select(columns).order("depth", { ascending: true }).limit(60);
      if (term.trim().length >= 2) q = q.ilike("name", `%${term.trim()}%`);
      if (typeFilter && typeFilter.length > 0) q = q.in("location_type_id", typeFilter);
      const { data, error } = await q;
      setLoading(false);
      if (error) {
        toast.error(error.message);
        return;
      }
      const list = (data ?? []) as RuLocation[];
      setRows(list);
      if (list.length === 0 && term.trim().length < 2) {
        const { count } = await supabase.from("ru_locations").select("id", { count: "exact", head: true });
        setEmptyRegister((count ?? 0) === 0);
      } else {
        setEmptyRegister(false);
      }
    },
    [typeFilter],
  );

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => void search(query), 200);
    return () => clearTimeout(t);
  }, [open, query, search]);

  const seedRegister = useCallback(async () => {
    setSeeding(true);
    const { data, error } = await supabase.functions.invoke("push-property-to-ru", {
      body: { action: "seed_ru_location_tree" },
    });
    setSeeding(false);
    if (error || !data?.success) {
      const detail = data?.error?.message || error?.message;
      const ruStatus = data?.error?.ru_status_id ? ` (RU status ${data.error.ru_status_id})` : "";
      toast.error(
        detail
          ? `RU location register: ${detail}${ruStatus}`
          : "Could not refresh the RU location register",
      );
      return;
    }

    if (data.endpoint_disabled) {
      toast.warning(
        data.note ||
          "Rentals United has not enabled the location dictionary for this integration — locations stay name-resolved at push time.",
      );
      return;
    }
    toast.success(`RU location register refreshed — ${data.upserted} locations cached`);
    void search(query);
  }, [query, search]);

  const label = useMemo(() => {
    if (!value) return null;
    if (selected) return selected.path || selected.name;
    return `LocationID ${value}`;
  }, [value, selected]);

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className="h-7 flex-1 justify-between text-xs font-normal"
          >
            <span className="flex min-w-0 items-center gap-1.5">
              <MapPin className="h-3 w-3 shrink-0 text-primary" />
              <span className="truncate">{label ?? "No RU location selected"}</span>
            </span>
            <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[420px] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput placeholder={placeholder} value={query} onValueChange={setQuery} />
            <CommandList>
              {loading && (
                <div className="flex items-center gap-2 px-3 py-3 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> Searching the RU register…
                </div>
              )}
              {!loading && (
                <CommandEmpty>
                  <div className="space-y-2 px-3 py-3 text-left text-xs text-muted-foreground">
                    {emptyRegister ? (
                      <p>
                        The Rentals United location register is empty. Refresh it to pull RU's
                        location tree (Pull_ListLocations_RQ).
                      </p>
                    ) : (
                      <p>No cached RU location matches that search.</p>
                    )}
                    {allowRefresh && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 gap-1 text-xs"
                        onClick={seedRegister}
                        disabled={seeding}
                      >
                        {seeding ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <RefreshCw className="h-3 w-3" />
                        )}
                        Refresh register
                      </Button>
                    )}
                  </div>
                </CommandEmpty>
              )}
              {rows.length > 0 && (
                <CommandGroup>
                  {rows.map((r) => (
                    <CommandItem
                      key={r.id}
                      value={String(r.id)}
                      className="text-xs"
                      onSelect={() => {
                        onChange(r.id, r);
                        setSelected(r);
                        setOpen(false);
                      }}
                    >
                      <Check className={cn("mr-2 h-3 w-3", value === r.id ? "opacity-100" : "opacity-0")} />
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate font-medium">{r.path || r.name}</span>
                        <span className="text-[10px] text-muted-foreground">
                          ID {r.id}
                          {r.location_type_id ? ` · ${RU_LOCATION_TYPE_LABEL[r.location_type_id] ?? `Type ${r.location_type_id}`}` : ""}
                          {r.currency_iso ? ` · ${r.currency_iso}` : ""}
                        </span>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {value ? (
        <>
          <Badge variant="secondary" className="h-6 shrink-0 font-mono text-[10px]">
            {value}
          </Badge>
          {!disabled && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0"
              onClick={() => {
                onChange(null, null);
                setSelected(null);
              }}
              aria-label="Clear RU location"
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </>
      ) : null}
    </div>
  );
}
