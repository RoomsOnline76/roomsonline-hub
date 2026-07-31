import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, FileSignature, Copy, Ban, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import {
  useRepContracts,
  useIssueRepContract,
  useRevokeRepContract,
  getRepContractSigningUrl,
} from "@/hooks/useRepContracts";
import type { SalesRep } from "@/hooks/useSalesReps";
import type { RepTierKey } from "@/lib/repContractTerms";

const STATUS_TONE: Record<string, string> = {
  signed: "bg-success-surface text-success",
  sent: "bg-info-surface text-info",
  revoked: "bg-danger-surface text-destructive",
  draft: "bg-muted text-muted-foreground",
};

interface Props {
  rep: SalesRep;
}

export function RepAgreementPanel({ rep }: Props) {
  const { data: contracts, isLoading } = useRepContracts(rep.id);
  const issue = useIssueRepContract();
  const revoke = useRevokeRepContract();
  const [copied, setCopied] = useState<string | null>(null);

  const active = contracts?.find((c) => c.status !== "revoked");
  const signed = contracts?.find((c) => c.status === "signed");

  const copyLink = (token: string) => {
    const url = getRepContractSigningUrl(token);
    navigator.clipboard.writeText(url);
    setCopied(token);
    toast.success("Signing link copied");
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <FileSignature className="h-4 w-4 text-primary" />
          Representative Agreement
        </CardTitle>
        <CardDescription className="text-xs">
          Terms are snapshotted from Billing Defaults (tier criteria) at the moment the agreement is issued.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="py-4 flex justify-center">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {(contracts || []).map((c) => (
              <div key={c.id} className="rounded-md border p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Badge className={STATUS_TONE[c.status] || ""}>{c.status}</Badge>
                  <span className="text-[11px] text-muted-foreground">
                    {c.signed_at
                      ? `Signed ${new Date(c.signed_at).toLocaleDateString()}`
                      : `Issued ${new Date(c.created_at).toLocaleDateString()}`}
                  </span>
                </div>
                {c.terms_snapshot && (
                  <p className="text-[11px] text-muted-foreground">
                    {c.terms_snapshot.tier_label} · {c.terms_snapshot.first_year_rate}% year 1 ·{" "}
                    {c.terms_snapshot.residual_rate}% residual for {c.terms_snapshot.residual_months} months ·{" "}
                    {c.terms_snapshot.clawback_days}-day clawback
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => copyLink(c.signing_token)}>
                    <Copy className="h-3 w-3 mr-1" />
                    {copied === c.signing_token ? "Copied" : "Copy link"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs"
                    onClick={() => window.open(getRepContractSigningUrl(c.signing_token), "_blank")}
                  >
                    <ExternalLink className="h-3 w-3 mr-1" />
                    Open
                  </Button>
                  {c.status !== "signed" && c.status !== "revoked" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs text-destructive"
                      onClick={() => revoke.mutate(c.id)}
                      disabled={revoke.isPending}
                    >
                      <Ban className="h-3 w-3 mr-1" />
                      Revoke
                    </Button>
                  )}
                </div>
              </div>
            ))}

            {!contracts?.length && (
              <p className="text-xs text-muted-foreground">No agreement issued yet for this rep.</p>
            )}

            <Button
              size="sm"
              className="w-full"
              disabled={issue.isPending}
              onClick={() =>
                issue.mutate({
                  rep: {
                    id: rep.id,
                    display_name: rep.display_name,
                    rep_code: rep.rep_code,
                    email: rep.email,
                    phone: rep.phone,
                    commission_tier: rep.commission_tier as RepTierKey,
                    quarterly_target: rep.quarterly_target,
                  },
                })
              }
            >
              {issue.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <FileSignature className="h-3 w-3 mr-1" />}
              {signed ? "Issue updated agreement" : active ? "Re-issue agreement" : "Issue agreement"}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
