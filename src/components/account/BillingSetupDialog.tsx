import { useMemo } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Lock } from "lucide-react";
import { computeExpectedBilling, type ExpectedBillingConfig } from "@/lib/billingExpected";
import { fmtMoney, type OwnerBillingConfig } from "@/lib/ownerAccount";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: OwnerBillingConfig | null;
  unitCount: number;
  byoGateway: boolean;
  currency: string;
}

/**
 * Read-only view of the contracted billing setup. Owners can inspect exactly what
 * ROL bills them, but only Admin/Dev/Fearless Leader may edit the billing config.
 */
export function BillingSetupDialog({ open, onOpenChange, config, unitCount, byoGateway, currency }: Props) {
  const expected = useMemo(
    () =>
      computeExpectedBilling(config as unknown as ExpectedBillingConfig, {
        units: unitCount,
        rooms: unitCount,
        byoGateway,
      }),
    [config, unitCount, byoGateway],
  );

  const monthly = expected.lines.filter((l) => !l.once);
  const once = expected.lines.filter((l) => l.once);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-muted-foreground" />
            Your billing setup
          </DialogTitle>
          <DialogDescription>
            These are the charges agreed in your contract. Changes are made by RoomsOnline only.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <section>
            <div className="mb-1 flex items-center justify-between">
              <span className="font-medium">Monthly subscription</span>
              <span className="font-semibold">{fmtMoney(expected.monthly, currency)}</span>
            </div>
            {monthly.length ? (
              <ul className="divide-y divide-border/60 rounded-md border border-border/60">
                {monthly.map((l) => (
                  <li key={l.label} className="flex items-center justify-between px-3 py-2">
                    <span className="text-muted-foreground">{l.label}</span>
                    <span>{fmtMoney(l.amount, currency)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">No recurring charges configured.</p>
            )}
          </section>

          <section>
            <div className="mb-1 flex items-center justify-between">
              <span className="font-medium">Once-off setup</span>
              <span className="font-semibold">{fmtMoney(expected.setup, currency)}</span>
            </div>
            {once.length ? (
              <ul className="divide-y divide-border/60 rounded-md border border-border/60">
                {once.map((l) => (
                  <li key={l.label} className="flex items-center justify-between px-3 py-2">
                    <span className="text-muted-foreground">{l.label}</span>
                    <span>{fmtMoney(l.amount, currency)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">No setup charges configured.</p>
            )}
          </section>

          <Badge variant="outline" className="text-[11px]">
            Read-only — contact RoomsOnline to change your billing setup
          </Badge>
        </div>
      </DialogContent>
    </Dialog>
  );
}
