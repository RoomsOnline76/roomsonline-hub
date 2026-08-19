import { AlertTriangle, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

/**
 * Everything the channel will be told when the distribution sub-account is created.
 * Resolved server-side by the read-only `plan_owner_account` preview.
 */
export interface OwnerAccountPlan {
  can_create: boolean;
  blocked_reason: string | null;
  outcome: "create" | "adopt" | "blocked";
  login_email: string | null;
  login_source: string;
  contact_first_name?: string | null;
  contact_last_name?: string | null;
  company_name?: string | null;
  country?: string | null;
  scope: "portfolio" | "property";
  portfolio_name?: string | null;
  portfolio_property_count?: number | null;
  existing_owner_id?: string | null;
  existing_login_email?: string | null;
  rejected_internal_login?: string | null;
  warnings?: string[];
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border py-1.5 last:border-b-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}

/**
 * Step 6 stops here on purpose: a distribution login is permanent once the channel
 * holds it, so the operator confirms the exact details first, or goes back to correct
 * the record they came from.
 */
export function OwnerAccountConfirmDialog({
  open,
  plan,
  loading,
  submitting,
  onConfirm,
  onCorrect,
  onClose,
}: {
  open: boolean;
  plan: OwnerAccountPlan | null;
  loading: boolean;
  submitting: boolean;
  onConfirm: () => void;
  onCorrect: () => void;
  onClose: () => void;
}) {
  const adopting = plan?.outcome === "adopt";
  const canConfirm = Boolean(plan?.can_create && plan?.login_email);

  return (
    <Dialog open={open} onOpenChange={(next) => (!next && !submitting ? onClose() : undefined)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Confirm the distribution sub-account</DialogTitle>
          <DialogDescription>
            These are the exact details that will be sent to the Channel Manager. The login cannot be
            changed once the account exists — check it before you continue.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="flex items-center py-6 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Working out what will be created…
          </p>
        ) : !plan ? (
          <p className="py-6 text-sm text-destructive">The details could not be resolved.</p>
        ) : (
          <div className="space-y-3">
            <div className="rounded-md border border-border p-3">
              <Badge variant="outline" className="mb-2 text-[10px]">
                {adopting
                  ? "An existing sub-account will be linked"
                  : plan.can_create
                    ? "A new sub-account will be created"
                    : "Nothing can be created yet"}
              </Badge>
              <div className="space-y-0">
                <Row label="Sub-account login" value={plan.login_email ?? "—"} />
                <Row label="Taken from" value={plan.login_source} />
                <Row
                  label="Contact name"
                  value={`${plan.contact_first_name ?? "—"} ${plan.contact_last_name ?? ""}`.trim()}
                />
                <Row
                  label="Applies to"
                  value={
                    plan.scope === "portfolio"
                      ? `${plan.portfolio_name ?? "This portfolio"}${
                          plan.portfolio_property_count
                            ? ` · ${plan.portfolio_property_count} propert${plan.portfolio_property_count === 1 ? "y" : "ies"}`
                            : ""
                        }`
                      : "This property only"
                  }
                />
                {plan.company_name && <Row label="Company name" value={plan.company_name} />}
                {plan.country && <Row label="Country" value={plan.country} />}
                {adopting && plan.existing_owner_id && (
                  <Row
                    label="Existing account"
                    value={`Account id ${plan.existing_owner_id}${
                      plan.existing_login_email ? ` · ${plan.existing_login_email}` : ""
                    }`}
                  />
                )}
              </div>
            </div>

            {plan.blocked_reason && (
              <p className="flex gap-2 rounded-md border border-destructive/40 p-3 text-xs text-destructive">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {plan.blocked_reason}
              </p>
            )}

            {(plan.warnings ?? []).length > 0 && (
              <ul className="space-y-1 rounded-md border border-border p-3 text-xs text-muted-foreground">
                {(plan.warnings ?? []).map((w, i) => (
                  <li key={i} className="flex gap-2">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                    <span>{w}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="outline" disabled={submitting} onClick={onCorrect}>
            Cancel — correct the details
          </Button>
          <Button disabled={!canConfirm || loading || submitting} onClick={onConfirm}>
            {submitting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
            {adopting ? "Confirm and link" : "Confirm and create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
