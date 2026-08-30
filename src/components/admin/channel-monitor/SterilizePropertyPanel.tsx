import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Eraser, Loader2, Search } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { invokeWithSession } from "@/lib/ensureFreshSession";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface PropertyRow {
  id: string;
  name: string;
  listingId: string | null;
}

interface SterilizeResult {
  success?: boolean;
  dry_run?: boolean;
  property?: { id: string; name: string };
  listings_to_archive?: { ru_property_id: string; ru_owner_id: string | null }[];
  listings_already_disconnected?: { ru_property_id: string; ru_owner_id: string | null; reason: string }[];
  archived_listings?: string[];
  orphaned_listings?: { ru_property_id: string; ru_owner_id: string | null; message: string }[];
  listings_kept?: string[];
  account_closes?: { ru_owner_id: string; status: string; code: string; confirmed: boolean; message: string }[];
  cancelled_queued_calls?: number;
  gates_reset?: number;
  cleared?: string[];
  steps?: { step: string; ok: boolean; message: string }[];
  error?: { code?: string; message?: string } | string;
}

const errorText = (r: SterilizeResult | null): string | null => {
  if (!r?.error) return null;
  return typeof r.error === "string" ? r.error : r.error.message ?? "That run did not complete.";
};

/**
 * Sterilize a property: end every earlier life it had at the channel so it can be
 * connected again as if brand new. Old listings are archived, the parked call
 * backlog is cancelled, local channel state is wiped and every onboarding gate goes
 * back to pending. A current binding can be preserved by naming the listing ids to keep.
 */
export function SterilizePropertyPanel() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<PropertyRow | null>(null);
  const [keepListings, setKeepListings] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<SterilizeResult | null>(null);
  const [preview, setPreview] = useState<SterilizeResult | null>(null);

  const { data: properties, isLoading } = useQuery({
    queryKey: ["sterilize-property-candidates"],
    staleTime: 60_000,
    queryFn: async (): Promise<PropertyRow[]> => {
      const { data, error } = await supabase
        .from("properties")
        .select("id, name, rentalsunited_property_id")
        .order("name");
      if (error) throw error;
      return (data ?? []).map((p) => ({
        id: p.id,
        name: p.name ?? "(unnamed)",
        listingId: p.rentalsunited_property_id ? String(p.rentalsunited_property_id) : null,
      }));
    },
  });

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return (properties ?? []).filter((p) => p.name.toLowerCase().includes(q)).slice(0, 8);
  }, [properties, search]);

  const keepIds = useMemo(
    () => keepListings.split(/[\s,]+/).map((s) => s.trim()).filter((s) => /^\d+$/.test(s)),
    [keepListings],
  );

  const run = useMutation({
    mutationFn: async (dryRun: boolean): Promise<SterilizeResult> => {
      if (!selected) throw new Error("Pick a property first.");
      /**
       * The preview is an authenticated call: a stale token made the console answer with a
       * bare "Edge function error". Renew the session first and, when the function still
       * refuses, read the refusal body so the real reason is shown instead of the transport.
       */
      const { data, error } = await invokeWithSession("ru-cert-portal", {
        body: {
          action: "sterilize_property",
          property_id: selected.id,
          keep_ru_property_ids: keepIds,
          dry_run: dryRun,
        },
      });
      const payload = (data ?? null) as SterilizeResult | null;
      if (error) {
        const ctx = (error as { context?: Response }).context;
        let body: SterilizeResult | null = payload;
        if (!body && ctx && typeof ctx.json === "function") {
          try { body = (await ctx.clone().json()) as SterilizeResult; } catch { /* non-JSON refusal */ }
        }
        if (body) return body;
        throw error;
      }
      return (payload ?? {}) as SterilizeResult;
    },
    onSuccess: (data, dryRun) => {
      if (dryRun) {
        setPreview(data);
        if (data.success === false) toast.error(errorText(data) ?? "The preview could not be built.");
        return;
      }
      setResult(data);
      setOpen(false);
      setConfirmText("");
      setPreview(null);
      if (data.success) {
        toast.success(
          `${data.property?.name ?? "Property"} sterilized — ${(data.archived_listings ?? []).length} old listing(s) archived, ${data.gates_reset ?? 0} gate(s) reset`,
        );
      } else {
        toast.error(errorText(data) ?? "Sterilization did not complete.");
      }
      queryClient.invalidateQueries({ queryKey: ["sterilize-property-candidates"] });
      queryClient.invalidateQueries({ queryKey: ["channel-properties"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Sterilization failed."),
  });

  return (
    <div className="rounded-lg border border-border p-4 space-y-4">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Eraser className="h-4 w-4 text-muted-foreground" />
          <h4 className="text-sm font-medium">Sterilize a property for a fresh connection</h4>
        </div>
        <p className="text-xs text-muted-foreground">
          Archives every listing this property has ever held at the channel, cancels its parked calls
          and resets all onboarding gates. The property is then connectable as if it had never been
          distributed. Keep a current listing id below when only the history should go.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="sterilize-search" className="text-xs">Property</Label>
        {isLoading ? (
          <Skeleton className="h-9 w-full" />
        ) : (
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              id="sterilize-search"
              className="pl-8"
              placeholder="Search by property name"
              value={selected ? selected.name : search}
              onChange={(e) => {
                setSelected(null);
                setPreview(null);
                setSearch(e.target.value);
              }}
            />
          </div>
        )}
        {!selected && matches.length > 0 && (
          <div className="rounded-md border border-border divide-y divide-border">
            {matches.map((p) => (
              <button
                key={p.id}
                type="button"
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted"
                onClick={() => {
                  setSelected(p);
                  setSearch(p.name);
                  setKeepListings("");
                  setPreview(null);
                  setResult(null);
                }}
              >
                <span>{p.name}</span>
                {p.listingId && <Badge variant="outline" className="text-[10px]">Listing {p.listingId}</Badge>}
              </button>
            ))}
          </div>
        )}
      </div>

      {selected && (
        <>
          <div className="space-y-2">
            <Label htmlFor="sterilize-keep" className="text-xs">
              Listing ids to keep (optional)
            </Label>
            <Input
              id="sterilize-keep"
              placeholder="e.g. 5966579"
              value={keepListings}
              onChange={(e) => {
                setKeepListings(e.target.value);
                setPreview(null);
              }}
            />
            <p className="text-[11px] text-muted-foreground">
              {keepIds.length > 0
                ? `Listing ${keepIds.join(", ")} and its account binding stay in place — everything before it is cleared.`
                : "Nothing kept: the property loses its listing ids and its distribution account binding."}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="sterilize-password" className="text-xs">
              Sub-account portal password (optional)
            </Label>
            <Input
              id="sterilize-password"
              type="password"
              autoComplete="off"
              placeholder="Only needed when the account holds no stored key pair"
              value={portalPassword}
              onChange={(e) => setPortalPassword(e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground">
              Sterilizing now also closes the distribution account at the channel, so its portal
              login stops working. That close runs as the sub-account itself — supply its password
              when no key pair is on file. Used for this run only and never stored.
            </p>
          </div>


          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={run.isPending}
              onClick={() => run.mutate(true)}
            >
              {run.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
              Preview what would be cleared
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={run.isPending}
              onClick={() => {
                setConfirmText("");
                setOpen(true);
              }}
            >
              <Eraser className="mr-1 h-3.5 w-3.5" />
              Sterilize
            </Button>
          </div>
        </>
      )}

      {preview && (
        <div className="rounded-md border border-border bg-muted/40 p-3 text-xs space-y-1">
          <p className="font-medium">
            {(preview.listings_to_archive ?? []).length} listing(s) would be archived
            {(preview.listings_kept ?? []).length > 0 && `, ${(preview.listings_kept ?? []).join(", ")} kept`}
          </p>
          {(preview.listings_to_archive ?? []).map((l) => (
            <p key={l.ru_property_id} className="text-muted-foreground">
              Listing {l.ru_property_id} · account {l.ru_owner_id ?? "not recorded"}
            </p>
          ))}
          {(preview.listings_already_disconnected ?? []).map((l) => (
            <p key={`d-${l.ru_property_id}`} className="text-muted-foreground">
              Listing {l.ru_property_id} · skipped — {l.reason}
            </p>
          ))}
          {(preview.steps ?? []).map((s) => (
            <p key={s.step} className="text-muted-foreground">• {s.message}</p>
          ))}
          {errorText(preview) && <p className="text-destructive">{errorText(preview)}</p>}
        </div>
      )}

      {result && (
        <div className="rounded-md border border-border p-3 text-xs space-y-1">
          {(result.steps ?? []).map((s) => (
            <p key={s.step} className="text-muted-foreground">• {s.message}</p>
          ))}
          {(result.orphaned_listings ?? []).length > 0 && (
            <div className="pt-1 space-y-1">
              <p className="flex items-center gap-1 font-medium text-amber-600">
                <AlertTriangle className="h-3.5 w-3.5" />
                Left as orphans
              </p>
              {(result.orphaned_listings ?? []).map((o) => (
                <p key={o.ru_property_id} className="text-muted-foreground">
                  Listing {o.ru_property_id}: {o.message}
                </p>
              ))}
            </div>
          )}
          {errorText(result) && <p className="text-destructive">{errorText(result)}</p>}
        </div>
      )}

      <Dialog open={open} onOpenChange={(o) => { if (!run.isPending) setOpen(o); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sterilize {selected?.name}?</DialogTitle>
            <DialogDescription>
              Every earlier listing is archived at the channel, the parked call backlog is cancelled
              and all onboarding gates go back to pending. Bookings, rates and history in ROL'OS are
              untouched. Type the property name to confirm.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={selected?.name ?? ""}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={run.isPending}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={run.isPending || confirmText.trim() !== (selected?.name ?? "").trim()}
              onClick={() => run.mutate(false)}
            >
              {run.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
              Sterilize now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default SterilizePropertyPanel;
