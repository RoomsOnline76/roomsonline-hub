import { useEffect, useMemo, useState } from "react";
import { Search, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Beds24Hotel {
  id: string;
  name: string;
  city: string | null;
  country: string | null;
  score?: number;
}

interface Props {
  propertyId: string | null;
  propertyName: string;
  currentPropertyId: string;
  onSelect: (beds24PropertyId: string, beds24PropertyName: string) => void;
}

/**
 * Lets the operator fuzzy-search the Beds24 property catalogue by name and
 * capture the matching Beds24 property ID into the General tab.
 */
export function Beds24PropertyLookup({
  propertyId,
  propertyName,
  currentPropertyId,
  onSelect,
}: Props) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(propertyName ?? "");
  const [loading, setLoading] = useState(false);
  const [hotels, setHotels] = useState<Beds24Hotel[]>([]);
  const [source, setSource] = useState<"static" | "unavailable" | null>(null);
  const [reason, setReason] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setQuery(propertyName ?? "");
      void runSearch(propertyName ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      void runSearch(query);
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const disabled = !propertyId;

  const runSearch = async (q: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("beds24-api", {
        body: {
          action: "list_hotels",
          property_id: propertyId ?? undefined,
          query: q?.trim() || undefined,
          limit: 25,
        },
      });
      if (error) throw error;
      if (data?.success === false) throw new Error(data?.error?.message ?? "Lookup failed");
      const payload = data?.data ?? {};
      setSource(payload.source ?? null);
      setReason(payload.reason ?? null);
      setHotels(Array.isArray(payload.hotels) ? payload.hotels : []);
    } catch (e: any) {
      setSource(null);
      setReason(null);
      setHotels([]);
      toast({
        title: "Beds24 lookup failed",
        description: e?.message ?? "Unknown error",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const helperText = useMemo(() => {
    if (loading) return "Searching Beds24 catalogue…";
    if (source === "unavailable") return reason ?? "Beds24 catalogue unavailable for this token.";
    if (!hotels.length && query.trim()) return `No Beds24 properties matched "${query.trim()}".`;
    if (!hotels.length) return "Type a property name to search.";
    return `${hotels.length} match${hotels.length === 1 ? "" : "es"} (Africa only)`;
  }, [loading, source, reason, hotels.length, query]);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 text-xs gap-1"
        onClick={() => setOpen(true)}
        disabled={disabled}
        title={disabled ? "Save the property first to enable lookup" : "Search Beds24 by property name"}
      >
        <Search className="h-3 w-3" />
        Search by name
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Find Beds24 Property ID</DialogTitle>
            <DialogDescription>
              Searches the Beds24 property list by name (filtered to African countries). Pick a row to capture its ID into the General tab.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Property name (e.g. Dassiesingel)"
              className="h-9"
            />

            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
              <span>{helperText}</span>
            </div>

            {source === "unavailable" ? (
              <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-3 text-xs">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                <div>
                  <div className="font-medium">Catalogue not accessible</div>
                  <div className="mt-1 text-muted-foreground">{reason}</div>
                </div>
              </div>
            ) : null}

            <ScrollArea className="h-72 rounded-md border border-border">
              <ul className="divide-y divide-border">
                {hotels.map((h) => {
                  const isCurrent = String(currentPropertyId) === String(h.id);
                  return (
                    <li
                      key={h.id}
                      className="flex items-center justify-between gap-3 px-3 py-2 text-xs hover:bg-muted/50"
                    >
                      <div className="min-w-0">
                        <div className="truncate font-medium">{h.name || "(unnamed)"}</div>
                        <div className="truncate text-muted-foreground">
                          ID {h.id}
                          {h.city || h.country
                            ? ` · ${[h.city, h.country].filter(Boolean).join(", ")}`
                            : ""}
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant={isCurrent ? "secondary" : "default"}
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => {
                          onSelect(String(h.id), h.name);
                          setOpen(false);
                          toast({
                            title: "Beds24 ID captured",
                            description: `${h.name || h.id} → ${h.id}`,
                          });
                        }}
                      >
                        {isCurrent ? "Current" : "Use this ID"}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </ScrollArea>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
