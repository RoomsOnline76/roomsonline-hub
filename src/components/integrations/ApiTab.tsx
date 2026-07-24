import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CodeSnippetBlock } from "./CodeSnippetBlock";
import { IntegrationToggle } from "./IntegrationToggle";
import { Terminal, RefreshCw, Eye, EyeOff } from "lucide-react";
import { ApiUsageCard } from "./ApiUsageCard";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface ApiTabProps {
  property: { id: string; name: string; slug: string };
}

export function ApiTab({ property }: ApiTabProps) {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    const fetchKey = async () => {
      const { data } = await supabase
        .from("integration_configs")
        .select("api_key")
        .eq("property_id", property.id)
        .eq("integration_type", "api")
        .maybeSingle();
      if (data?.api_key) setApiKey(data.api_key);
    };
    fetchKey();
  }, [property.id]);

  const generateApiKey = async () => {
    setGenerating(true);
    const newKey = `rol_${crypto.randomUUID().replace(/-/g, "")}`;

    const { data: existing } = await supabase
      .from("integration_configs")
      .select("id")
      .eq("property_id", property.id)
      .eq("integration_type", "api")
      .maybeSingle();

    if (existing) {
      await supabase
        .from("integration_configs")
        .update({ api_key: newKey, is_active: true })
        .eq("id", existing.id);
    } else {
      await supabase
        .from("integration_configs")
        .insert({ property_id: property.id, integration_type: "api", api_key: newKey, is_active: true });
    }

    setApiKey(newKey);
    setShowKey(true);
    setGenerating(false);
    toast({ title: "API key generated", description: "Save it securely — it won't be shown again in full." });
  };

  const baseUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

  const curlExample = `curl -X POST "${baseUrl}/wordpress-plugin-api" \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: YOUR_API_KEY" \\
  -d '{
    "action": "get_availability",
    "property_id": "${property.id}",
    "check_in": "2026-04-01",
    "check_out": "2026-04-05"
  }'`;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Terminal className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Developer API</CardTitle>
          </div>
          <IntegrationToggle propertyId={property.id} integrationType="api" />
        </div>
        <CardDescription>
          For custom integrations — use the REST API to query availability and initiate bookings
          from your own application code.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <h4 className="text-sm font-medium mb-2">API Endpoint</h4>
          <code className="block bg-muted px-3 py-2 rounded text-sm font-mono break-all">
            {baseUrl}/wordpress-plugin-api
          </code>
        </div>

        <div>
          <h4 className="text-sm font-medium mb-2">API Key</h4>
          <div className="flex items-center gap-2">
            {apiKey ? (
              <>
                <code className="flex-1 bg-muted px-3 py-2 rounded text-sm font-mono">
                  {showKey ? apiKey : `${apiKey.slice(0, 8)}${"•".repeat(24)}`}
                </code>
                <Button variant="ghost" size="sm" onClick={() => setShowKey(!showKey)}>
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </>
            ) : (
              <span className="text-sm text-muted-foreground">No API key generated yet</span>
            )}
            <Button variant="outline" size="sm" onClick={generateApiKey} disabled={generating} className="gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" />
              {apiKey ? "Rotate" : "Generate"}
            </Button>
          </div>
        </div>

        <div>
          <h4 className="text-sm font-medium mb-2">Example Request</h4>
          <CodeSnippetBlock code={curlExample} language="bash" title="cURL — Check Availability" />
        </div>

        <div className="bg-muted/50 rounded-lg p-4 text-sm text-muted-foreground space-y-2">
          <h5 className="font-medium text-foreground">Available Endpoints</h5>
          <ul className="list-disc list-inside space-y-1">
            <li><code className="bg-muted px-1 rounded">get_property_info</code> — Property details, rooms, rates</li>
            <li><code className="bg-muted px-1 rounded">get_availability</code> — Live room availability for date range</li>
            <li><code className="bg-muted px-1 rounded">create_booking_redirect</code> — Generate a booking URL with tracking</li>
          </ul>
        </div>

        <ApiUsageCard propertyId={property.id} />
      </CardContent>
    </Card>
  );
}
