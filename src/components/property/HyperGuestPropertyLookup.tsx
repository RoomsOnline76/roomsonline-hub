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

interface HyperGuestHotel {
  id: string;
  name: string;
  city: string | null;
  country: string | null;
  score?: number;
}

interface Props {
  propertyId: string | null;
  propertyName: string;
  currentHotelId: string;
  onSelect: (hotelId: string, hotelName: string) => void;
}

/**
 * Lets the operator fuzzy-search the HyperGuest static catalogue by property
 * name and capture the matching HyperGuest hotel ID into the General tab.
 */
export function HyperGuestPropertyLookup({
  propertyId,
  propertyName,
  currentHotelId,
  onSelect,
}: Props) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(propertyName ?? "");
  const [loading, setLoading] = useState(false);
  const [hotels, setHotels] = useState<HyperGuestHotel[]>([]);
  const [source, setSource] = useState<"static" | "unavailable" | null>(null);
  const [reason, setReason] = useState<string | null>(null);

  // Reset query when opening
  useEffect(() => {
    if (open) {
      setQuery(propertyName ?? "");
      void runSearch(propertyName ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Debounce
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
      const { data, error } = await supabase.functions.invoke("hyperguest-api", {
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
        title: "HyperGuest lookup failed",
        description: e?.message ?? "Unknown error",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const helperText = useMemo(() => {
    if (loading) return "Searching HyperGuest catalogue…";
    if (source === "unavailable") return reason ?? "HyperGuest catalogue unavailable for this token.";
    if (!hotels.length && query.trim()) return `No HyperGuest hotels matched "${query.trim()}".`;
    if (!hotels.length) return "Type a property name to search.";
    return `${hotels.length} match${hotels.length === 1 ? "" : "es"}`;
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
        title={disabled ? "Save the property first to enable lookup" : "Search HyperGuest by property name"}
      >
        <Search className="h-3 w-3" />
        Search by name
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Find HyperGuest Hotel ID</DialogTitle>
            <DialogDescription>
              Searches the HyperGuest static catalogue by name. Pick a row to capture its ID
              into the General tab.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Property name (e.g. Ashbourne House)"
              className="h-9"
            />

            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
              <span>{helperText}</span>
            </div>

            {source === "unavailable" ? (
              <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-3 text-xs">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <div>
                  <div className="font-medium">Catalogue not accessible</div>
                  <div className="mt-1 text-muted-foreground">{reason}</div>
                </div>
              </div>
            ) : null}

            <ScrollArea className="h-72 rounded-md border border-border">
              <ul className="divide-y divide-border">
                {hotels.map((h) => {
                  const isCurrent = String(currentHotelId) === String(h.id);
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
                            title: "HyperGuest ID captured",
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
