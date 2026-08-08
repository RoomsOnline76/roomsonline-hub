import { Link } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  suspended: boolean;
  paidThrough: string | null;
}

/**
 * Shown across ROL'OS when a subscription has been cancelled.
 *
 * While the paid period is still running the message is informational — service
 * continues in full. Once the account is suspended it makes clear that access
 * and functionality are restricted pending reactivation.
 */
export function SubscriptionSuspendedBanner({ suspended, paidThrough }: Props) {
  return (
    <div
      className={[
        "mb-4 flex flex-col gap-2 rounded-lg border p-3 text-sm sm:flex-row sm:items-center sm:justify-between",
        suspended ? "border-destructive/40 bg-destructive/10 text-destructive" : "border-border bg-muted",
      ].join(" ")}
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <p className="font-medium">
            {suspended ? "Account suspended pending reactivation" : "Subscription cancellation scheduled"}
          </p>
          <p className={suspended ? "text-xs" : "text-xs text-muted-foreground"}>
            {suspended
              ? "Access and functionality are restricted. Your data is retained and restored on reactivation."
              : `Full service continues until ${paidThrough ?? "the end of the paid period"}, after which access will be restricted.`}
          </p>
        </div>
      </div>
      <Button asChild size="sm" variant={suspended ? "default" : "outline"} className="shrink-0">
        <Link to="/admin/account">{suspended ? "Reactivate subscription" : "Manage subscription"}</Link>
      </Button>
    </div>
  );
}
