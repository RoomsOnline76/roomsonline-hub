import { ExternalLink, Loader2, PlugZap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  hubspotUrl,
  useHubspotCapability,
  useHubspotContactSummary,
} from "@/hooks/useHubspotCrm";

interface GuestHubspotPanelProps {
  email: string | null | undefined;
}

/**
 * Secondary, read-only CRM context for a guest.
 *
 * Native ROL'OS data stays primary and is rendered above this panel. Nothing
 * here is editable, and the whole block simply does not render when the add-on
 * is off, unhealthy, still loading, or has no matching contact.
 */
export function GuestHubspotPanel({ email }: GuestHubspotPanelProps) {
  const { healthy, status } = useHubspotCapability();
  const { data, isLoading, isError } = useHubspotContactSummary(email, healthy);

  if (!healthy || !email) return null;

  if (isLoading) {
    return (
      <div className="rounded-lg border border-dashed p-3">
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking CRM…
        </p>
      </div>
    );
  }

  // A failed or unmatched lookup is not an error worth showing an operator.
  if (isError || !data?.linked) return null;

  const portal = status?.portalId ?? data.portal_id;
  const contactLink = portal ? hubspotUrl(portal, `/contact/${data.contact_id}`) : null;
  const openDeals = (data.deals || []).filter((d) => !d.closed);

  return (
    <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <PlugZap className="h-3.5 w-3.5" /> CRM context
        </p>
        {contactLink && (
          <a
            href={contactLink}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 text-xs text-primary hover:underline"
          >
            Open in HubSpot <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <p className="text-muted-foreground">Contact owner</p>
          <p className="font-medium">{data.owner_name || "Unassigned"}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Lifecycle</p>
          <p className="font-medium capitalize">
            {data.lifecycle_stage?.replace(/_/g, " ") || "—"}
          </p>
        </div>
      </div>

      {(data.trade_or_direct || data.rol_lifecycle || data.lead_status) && (
        <div className="flex flex-wrap gap-1">
          {data.trade_or_direct && (
            <Badge variant="outline" className="text-[10px] capitalize">
              {data.trade_or_direct}
            </Badge>
          )}
          {data.rol_lifecycle && (
            <Badge variant="outline" className="text-[10px] capitalize">
              {data.rol_lifecycle.replace(/_/g, " ")}
            </Badge>
          )}
          {data.lead_status && (
            <Badge variant="secondary" className="text-[10px] capitalize">
              {data.lead_status.replace(/_/g, " ")}
            </Badge>
          )}
        </div>
      )}

      {openDeals.length > 0 && (
        <>
          <Separator />
          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Open deals ({openDeals.length})
            </p>
            {openDeals.slice(0, 4).map((deal) => (
              <div key={deal.id} className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate">{deal.name || "Untitled deal"}</span>
                <span className="shrink-0 text-muted-foreground">
                  {deal.stage?.replace(/_/g, " ") || "—"}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {(data.timeline || []).length > 0 && (
        <>
          <Separator />
          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Recent CRM activity
            </p>
            {(data.timeline || []).slice(0, 3).map((entry) => (
              <div key={entry.id} className="text-xs">
                <p className="line-clamp-2 text-foreground/90">{entry.body || "Note"}</p>
                {entry.at && (
                  <p className="text-[10px] text-muted-foreground">
                    {new Date(entry.at).toLocaleString()}
                  </p>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      <p className="text-[10px] text-muted-foreground">
        Read-only mirror of your CRM. ROL'OS records remain the source of truth.
      </p>
    </div>
  );
}
