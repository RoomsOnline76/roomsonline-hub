import { useQuery } from "@tanstack/react-query";
import { Building2, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * States what the open Channel Manager frame actually covers.
 *
 * One distribution account serves a whole portfolio, so the frame is account-scoped:
 * without this header an operator cannot tell which properties (and which of their
 * listings) they are about to connect to a channel.
 */

type MemberState = "connected" | "awaiting" | "not_pushed";

interface ScopeMember {
  id: string;
  name: string;
  listings: number;
  state: MemberState;
}

interface ScopeInfo {
  portfolioName: string | null;
  members: ScopeMember[];
}

const STATE_META: Record<MemberState, { label: string; className: string }> = {
  connected: {
    label: "Channels connected",
    className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700",
  },
  awaiting: {
    label: "Awaiting channels",
    className: "border-amber-500/40 bg-amber-500/10 text-amber-700",
  },
  not_pushed: {
    label: "No listing yet",
    className: "border-destructive/40 bg-destructive/10 text-destructive",
  },
};

async function loadScope(propertyId: string): Promise<ScopeInfo> {
  const { data: membership } = await supabase
    .from("property_portfolio_members")
    .select("portfolio_id, property_portfolios:portfolio_id(id, name)")
    .eq("property_id", propertyId)
    .maybeSingle();

  const portfolioId = (membership as { portfolio_id?: string } | null)?.portfolio_id ?? null;
  const portfolioName =
    ((membership as { property_portfolios?: { name?: string } } | null)?.property_portfolios?.name ??
      null) || null;

  let ids = [propertyId];
  if (portfolioId) {
    const { data: siblings } = await supabase
      .from("property_portfolio_members")
      .select("property_id")
      .eq("portfolio_id", portfolioId);
    const memberIds = (siblings ?? []).map((s: { property_id: string }) => s.property_id);
    if (memberIds.length) ids = [...new Set(memberIds)];
  }

  const [{ data: props }, { data: units }, { data: settings }] = await Promise.all([
    supabase.from("properties").select("id, name").in("id", ids),
    supabase
      .from("hostfully_room_types")
      .select("property_id, rentalsunited_property_id")
      .in("property_id", ids)
      .not("rentalsunited_property_id", "is", null),
    supabase
      .from("ru_platform_settings")
      .select("key")
      .in("key", ids.map((id) => `ru_channel_id:${id}`)),
  ]);

  const listingCount = new Map<string, number>();
  ((units ?? []) as Array<{ property_id: string | null }>).forEach((u) => {
    if (!u.property_id) return;
    listingCount.set(u.property_id, (listingCount.get(u.property_id) ?? 0) + 1);
  });
  const channelKeys = new Set(
    ((settings ?? []) as Array<{ key: string | null }>).map((s) => s.key ?? ""),
  );

  const members: ScopeMember[] = ((props ?? []) as Array<{ id: string; name: string }>)
    .map((p) => {
      const listings = listingCount.get(p.id) ?? 0;
      const state: MemberState = listings === 0
        ? "not_pushed"
        : channelKeys.has(`ru_channel_id:${p.id}`)
          ? "connected"
          : "awaiting";
      return { id: p.id, name: p.name, listings, state };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return { portfolioName, members };
}

export function ChannelScopeHeader({
  propertyId,
  loginEmail,
  scope,
  showAccount = false,
}: {
  propertyId: string | null | undefined;
  /** Distribution account login, shown to staff only. */
  loginEmail?: string | null;
  scope?: "portfolio" | "property" | null;
  showAccount?: boolean;
}) {
  const { data } = useQuery({
    queryKey: ["channel-scope-header", propertyId],
    enabled: !!propertyId,
    staleTime: 60_000,
    queryFn: () => loadScope(propertyId as string),
  });

  if (!propertyId || !data) return null;

  const { portfolioName, members } = data;
  const isPortfolio = members.length > 1 || scope === "portfolio";

  return (
    <div className="space-y-2 border-b bg-muted/40 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Building2 className="h-4 w-4 text-primary" />
        <span className="font-medium text-foreground">
          {isPortfolio
            ? `Connecting ${portfolioName ? `${portfolioName} — ` : ""}${members.length} propert${members.length === 1 ? "y" : "ies"}`
            : `Connecting ${members[0]?.name ?? "this property"}`}
        </span>
        {showAccount && loginEmail && (
          <span className="text-xs text-muted-foreground">Signed in as {loginEmail}</span>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {members.map((m) => (
          <Badge
            key={m.id}
            variant="outline"
            className={cn("gap-1 text-[11px] font-medium", STATE_META[m.state].className)}
          >
            {m.name}
            <span className="opacity-70">
              · {m.listings} {m.listings === 1 ? "listing" : "listings"} · {STATE_META[m.state].label}
            </span>
          </Badge>
        ))}
      </div>

      <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Finishing here connects the whole account to the channel. Each property still shows as
        connected only once its own listing is mapped on that channel — properties without a listing
        yet cannot be mapped.
      </p>
    </div>
  );
}
