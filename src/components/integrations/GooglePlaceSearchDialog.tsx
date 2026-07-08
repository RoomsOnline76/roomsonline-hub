import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, MapPin, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { useToast } from "@/hooks/use-toast";

interface PlaceResult {
  id: string;
  name: string;
  address: string;
  lat: number | null;
  lng: number | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initialQuery?: string;
  onSelect: (placeId: string, meta: PlaceResult) => void;
}

export function GooglePlaceSearchDialog({ open, onOpenChange, initialQuery = "", onSelect }: Props) {
  const [query, setQuery] = useState(initialQuery);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [searched, setSearched] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      setQuery(initialQuery);
      setResults([]);
      setSearched(false);
    }
  }, [open, initialQuery]);

  const runSearch = async () => {
    const q = query.trim();
    if (q.length < 2) return;
    setLoading(true);
    setSearched(true);
    try {
      const { data, error } = await supabase.functions.invoke("search-google-place", {
        body: { query: q },
      });
      if (error) {
        const details = error instanceof FunctionsHttpError ? await error.context.text() : error.message;
        console.error("search-google-place failed:", details);
        toast({ title: "Search failed", description: details, variant: "destructive" });
        setResults([]);
        return;
      }
      setResults(data?.results ?? []);
    } catch (e: any) {
      toast({ title: "Search failed", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const pick = (r: PlaceResult) => {
    onSelect(r.id, r);
    onOpenChange(false);
    toast({ title: "Place ID set", description: r.name });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Find Google Place ID</DialogTitle>
          <DialogDescription>Search by business name to locate the correct Google Place.</DialogDescription>
        </DialogHeader>

        <div className="flex gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); runSearch(); } }}
            placeholder="e.g. Jongensfontein Holiday Accommodation"
            autoFocus
          />
          <Button type="button" onClick={runSearch} disabled={loading || query.trim().length < 2}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          </Button>
        </div>

        <div className="max-h-80 overflow-y-auto space-y-2">
          {!loading && searched && results.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">No places found. Try a different query.</p>
          )}
          {results.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => pick(r)}
              className="w-full text-left rounded-md border border-border p-3 hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-start gap-2">
                <MapPin className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{r.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{r.address}</p>
                  <p className="text-[10px] font-mono text-muted-foreground truncate mt-0.5">{r.id}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
