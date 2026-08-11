import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  RefundRecord,
  useRefundDecision,
  useRefundRegister,
} from "@/hooks/useRefundRegister";
import { displayBookingReference } from "@/lib/bookingReference";
import { AlertTriangle, BadgeCheck, Clock, RotateCcw, XCircle } from "lucide-react";

interface RefundRegisterPanelProps {
  propertyId?: string | null;
}

const STATUS_META: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  pending: { label: "Awaiting approval", variant: "secondary" },
  approved: { label: "Approved", variant: "default" },
  processed: { label: "Processed", variant: "outline" },
  rejected: { label: "Rejected", variant: "destructive" },
  failed: { label: "Gateway failed", variant: "destructive" },
};

const money = (v: number | null | undefined) =>
  `R${Number(v ?? 0).toLocaleString("en-ZA", { minimumFractionDigits: 2 })}`;

export function RefundRegisterPanel({ propertyId }: RefundRegisterPanelProps) {
  const [filter, setFilter] = useState<string>("open");
  const { data: refunds = [], isLoading } = useRefundRegister(propertyId ?? null);
  const decision = useRefundDecision();
  const [rejecting, setRejecting] = useState<RefundRecord | null>(null);
  const [rejectNote, setRejectNote] = useState("");

  const visible = useMemo(() => {
    if (filter === "all") return refunds;
    if (filter === "open")
      return refunds.filter((r) => ["pending", "approved", "failed"].includes(r.status));
    return refunds.filter((r) => r.status === filter);
  }, [refunds, filter]);

  const totals = useMemo(() => {
    const sum = (statuses: string[]) =>
      refunds
        .filter((r) => statuses.includes(r.status))
        .reduce((s, r) => s + Number(r.amount || 0), 0);
    return {
      pending: sum(["pending"]),
      approved: sum(["approved", "failed"]),
      processed: sum(["processed"]),
    };
  }, [refunds]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card>
          <CardContent className="pt-5">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />Awaiting approval
            </p>
            <p className="text-xl font-semibold">{money(totals.pending)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              <BadgeCheck className="h-3 w-3" />Approved, not yet paid
            </p>
            <p className="text-xl font-semibold">{money(totals.approved)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              <RotateCcw className="h-3 w-3" />Refunded to guests
            </p>
            <p className="text-xl font-semibold">{money(totals.processed)}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle className="text-sm">Refund register</CardTitle>
          <Tabs value={filter} onValueChange={setFilter}>
            <TabsList>
              <TabsTrigger value="open">Open</TabsTrigger>
              <TabsTrigger value="pending">Pending</TabsTrigger>
              <TabsTrigger value="processed">Processed</TabsTrigger>
              <TabsTrigger value="all">All</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Loading refunds…</p>
          ) : visible.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No refunds in this view.
            </p>
          ) : (
            visible.map((r) => {
              const meta = STATUS_META[r.status] ?? { label: r.status, variant: "secondary" as const };
              const overEntitlement =
                r.entitled_amount !== null && Number(r.amount) > Number(r.entitled_amount) + 0.01;
              return (
                <div key={r.id} className="rounded-lg border p-3 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {r.booking?.guest_name || "Guest"} ·{" "}
                        <span className="font-mono text-xs">
                          {displayBookingReference(r.booking ?? { id: r.booking_id ?? "" })}
                        </span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {r.reason || "—"}
                        {r.reason_category ? ` · ${r.reason_category.replace(/_/g, " ")}` : ""}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold">{money(r.amount)}</p>
                      <Badge variant={meta.variant} className="text-[10px]">{meta.label}</Badge>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                    <span>
                      Policy entitlement:{" "}
                      {r.entitled_amount === null ? "not resolved" : money(r.entitled_amount)}
                    </span>
                    <span>Gateway: {r.gateway || "—"}</span>
                    {r.gateway_refund_id && <span>Ref: {r.gateway_refund_id}</span>}
                    {r.manual_settlement && <span>Manual settlement</span>}
                  </div>

                  {overEntitlement && (
                    <p className="text-[11px] text-warning flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      Above the policy entitlement — approving is a discretionary decision.
                    </p>
                  )}
                  {r.gateway_error && (
                    <p className="text-[11px] text-destructive">Gateway: {r.gateway_error}</p>
                  )}
                  {r.rejected_reason && (
                    <p className="text-[11px] text-muted-foreground">
                      Rejected: {r.rejected_reason}
                    </p>
                  )}

                  {["pending", "approved", "failed"].includes(r.status) && (
                    <>
                      <Separator />
                      <div className="flex flex-wrap gap-2 justify-end">
                        {r.status === "pending" || r.status === "failed" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={decision.isPending}
                            onClick={() => {
                              setRejectNote("");
                              setRejecting(r);
                            }}
                          >
                            <XCircle className="h-3.5 w-3.5 mr-1.5" />Reject
                          </Button>
                        ) : null}
                        {r.status === "pending" && (
                          <Button
                            size="sm"
                            disabled={decision.isPending}
                            onClick={() =>
                              decision.mutate({ action: "approve_refund", refund_id: r.id })
                            }
                          >
                            <BadgeCheck className="h-3.5 w-3.5 mr-1.5" />Approve
                          </Button>
                        )}
                        {(r.status === "approved" || r.status === "failed") && (
                          <Button
                            size="sm"
                            disabled={decision.isPending}
                            onClick={() =>
                              decision.mutate({ action: "execute_refund", refund_id: r.id })
                            }
                          >
                            <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                            {r.status === "failed" ? "Retry refund" : "Pay refund"}
                          </Button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <Dialog open={!!rejecting} onOpenChange={(o) => !o && setRejecting(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reject refund</DialogTitle>
            <DialogDescription>
              The requester and admins are notified with your note.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={rejectNote}
            onChange={(e) => setRejectNote(e.target.value)}
            placeholder="Why is this refund not payable?"
            rows={4}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejecting(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={rejectNote.trim().length < 3 || decision.isPending}
              onClick={() => {
                if (!rejecting) return;
                decision.mutate(
                  { action: "reject_refund", refund_id: rejecting.id, note: rejectNote.trim() },
                  { onSuccess: () => setRejecting(null) },
                );
              }}
            >
              Reject refund
            </Button>
          </DialogFooter>
        </DialogContent>

      </Dialog>
    </div>
  );
}
