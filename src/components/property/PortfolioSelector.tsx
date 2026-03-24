import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FolderOpen } from "lucide-react";

interface PortfolioSelectorProps {
  propertyId: string;
  onDirty: () => void;
}

export function PortfolioSelector({ propertyId, onDirty }: PortfolioSelectorProps) {
  const { data: portfolios = [] } = useQuery({
    queryKey: ["portfolios-all"],
    queryFn: async () => {
      const { data } = await supabase
        .from("property_portfolios" as any)
        .select("*")
        .order("name");
      return (data || []) as any[];
    },
  });

  const { data: memberships = [], refetch } = useQuery({
    queryKey: ["property-portfolio-memberships", propertyId],
    queryFn: async () => {
      const { data } = await supabase
        .from("property_portfolio_members" as any)
        .select("portfolio_id")
        .eq("property_id", propertyId);
      return (data || []).map((m: any) => m.portfolio_id) as string[];
    },
    enabled: !!propertyId,
  });

  const togglePortfolio = async (portfolioId: string) => {
    if (memberships.includes(portfolioId)) {
      await supabase
        .from("property_portfolio_members" as any)
        .delete()
        .eq("property_id", propertyId)
        .eq("portfolio_id", portfolioId);
    } else {
      await supabase
        .from("property_portfolio_members" as any)
        .insert({ portfolio_id: portfolioId, property_id: propertyId } as any);
    }
    refetch();
    onDirty();
  };

  if (portfolios.length === 0) return null;

  return (
    <Card>
      <CardHeader className="py-3 px-4">
        <CardTitle className="text-sm flex items-center gap-2">
          <FolderOpen className="h-4 w-4 text-primary" />
          Portfolio Groups
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          Assign this property to one or more portfolio groups for consolidated reporting.
        </p>
      </CardHeader>
      <CardContent className="py-3 px-4">
        <div className="flex flex-wrap gap-2">
          {portfolios.map((p: any) => {
            const isMember = memberships.includes(p.id);
            return (
              <label
                key={p.id}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-all text-xs ${
                  isMember
                    ? "bg-primary/10 border-primary/30 text-foreground"
                    : "bg-background border-border hover:border-primary/50 text-muted-foreground"
                }`}
              >
                <Checkbox
                  checked={isMember}
                  onCheckedChange={() => togglePortfolio(p.id)}
                />
                {p.name}
              </label>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
