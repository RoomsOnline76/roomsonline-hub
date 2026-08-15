import { Link } from "react-router-dom";
import { Lock } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface Props {
  propertyId: string;
  /** Admin / dev / fearless leader get the direct route to the billing switch. */
  canManageBilling: boolean;
}

/**
 * Shown wherever the Channels wizard would render for a property whose Channel
 * Manager entitlement has not been switched on in billing. Enabling it is the
 * first commercial step; the wizard only exists after that.
 */
export function ChannelManagerNotEnabled({ propertyId, canManageBilling }: Props) {
  return (
    <Card className="mx-auto max-w-xl">
      <CardHeader className="items-start gap-2">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-muted">
          <Lock className="h-4 w-4 text-muted-foreground" />
        </span>
        <CardTitle className="text-lg">Channel Manager is not enabled</CardTitle>
        <CardDescription>
          Channel distribution is a billable add-on. The Channels wizard opens once the Channel Manager is switched
          on for this property or its portfolio and included in the billing agreement.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {canManageBilling ? (
          <>
            <p className="text-sm text-muted-foreground">
              Switch it on under the property's billing configuration — that also re-activates any listings at the
              Channel Manager.
            </p>
            <Button asChild size="sm">
              <Link to={`/admin/properties/${propertyId}?section=billing`}>Open billing configuration</Link>
            </Button>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Contact us to add the Channel Manager to your agreement and we will open distribution for this property.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
