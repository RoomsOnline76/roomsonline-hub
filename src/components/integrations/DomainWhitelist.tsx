import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, X, Shield } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface DomainWhitelistProps {
  propertyId: string;
  integrationType: string;
  initialDomains?: string[];
}

export function DomainWhitelist({ propertyId, integrationType, initialDomains = [] }: DomainWhitelistProps) {
  const [domains, setDomains] = useState<string[]>(initialDomains);
  const [newDomain, setNewDomain] = useState("");
  const [saving, setSaving] = useState(false);

  const addDomain = async () => {
    const domain = newDomain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    if (!domain || domains.includes(domain)) return;

    const updated = [...domains, domain];
    setDomains(updated);
    setNewDomain("");
    await saveDomains(updated);
  };

  const removeDomain = async (domain: string) => {
    const updated = domains.filter((d) => d !== domain);
    setDomains(updated);
    await saveDomains(updated);
  };

  const saveDomains = async (domainList: string[]) => {
    setSaving(true);
    const { data: existing } = await supabase
      .from("integration_configs")
      .select("id")
      .eq("property_id", propertyId)
      .eq("integration_type", integrationType)
      .maybeSingle();

    if (existing) {
      await supabase
        .from("integration_configs")
        .update({ allowed_domains: domainList })
        .eq("id", existing.id);
    } else {
      await supabase
        .from("integration_configs")
        .insert({
          property_id: propertyId,
          integration_type: integrationType,
          allowed_domains: domainList,
          is_active: true,
        });
    }
    setSaving(false);
    toast({ title: "Domains updated" });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-sm font-medium">Allowed Domains</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Restrict which websites can load your booking widget. Leave empty to allow all domains.
        </p>
        <div className="flex gap-2">
          <Input
            placeholder="example.com"
            value={newDomain}
            onChange={(e) => setNewDomain(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addDomain()}
            className="text-sm"
          />
          <Button size="sm" variant="outline" onClick={addDomain} disabled={saving}>
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
        {domains.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {domains.map((domain) => (
              <Badge key={domain} variant="secondary" className="gap-1 text-xs">
                {domain}
                <button onClick={() => removeDomain(domain)} className="ml-0.5 hover:text-destructive">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
