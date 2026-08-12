import { Building2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Empty state for ROL'OS surfaces that need a linked property.
 *
 * Some accounts (e.g. partner/IT test logins) exist before any property has been
 * assigned to them. Those surfaces must stay inert — no calendar, no inventory,
 * no channel connection — until a property is linked.
 */
export function PmsNoPropertyState({
  title = "No property linked yet",
  description = "This account has no property assigned. Once a property is linked to it, this page fills in automatically.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="max-w-2xl mx-auto py-10">
      <Card className="border-dashed">
        <CardContent className="p-8 text-center space-y-3">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Building2 className="h-6 w-6 text-muted-foreground" />
          </div>
          <h1 className="text-lg font-semibold text-foreground">{title}</h1>
          <p className="text-sm text-muted-foreground">{description}</p>
        </CardContent>
      </Card>
    </div>
  );
}
