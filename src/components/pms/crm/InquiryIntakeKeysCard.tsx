import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Copy, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

interface IntakeKey {
  id: string;
  key_public: string;
  label: string | null;
  is_active: boolean;
  allowed_origins: string[] | null;
  request_count: number;
  last_used_at: string | null;
  created_at: string;
}

const FUNCTIONS_BASE = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.functions.supabase.co/inquiry-intake`;

/** Publishable website keys that let a property's own site post inquiries in. */
export function InquiryIntakeKeysCard({ propertyId }: { propertyId: string | null }) {
  const [keys, setKeys] = useState<IntakeKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [label, setLabel] = useState("");
  const [origins, setOrigins] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    if (!propertyId) {
      setKeys([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("rolos_inquiry_keys")
      .select("*")
      .eq("property_id", propertyId)
      .order("created_at", { ascending: false });
    if (error) console.error("[InquiryIntakeKeys] load failed:", error.message);
    setKeys((data || []) as IntakeKey[]);
    setLoading(false);
  }, [propertyId]);

  useEffect(() => {
    void load();
  }, [load]);

  const create = useCallback(async () => {
    if (!propertyId) return;
    setCreating(true);
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase.from("rolos_inquiry_keys").insert({
      property_id: propertyId,
      label: label.trim() || "Website form",
      allowed_origins: origins
        .split(",")
        .map((o) => o.trim())
        .filter(Boolean),
      created_by: auth?.user?.id ?? null,
    });
    setCreating(false);
    if (error) {
      toast.error(`Could not create the key: ${error.message}`);
      return;
    }
    setLabel("");
    setOrigins("");
    toast.success("Website key created");
    await load();
  }, [propertyId, label, origins, load]);

  const toggle = useCallback(
    async (key: IntakeKey) => {
      const { error } = await supabase
        .from("rolos_inquiry_keys")
        .update({ is_active: !key.is_active })
        .eq("id", key.id);
      if (error) {
        toast.error(`Could not update the key: ${error.message}`);
        return;
      }
      await load();
    },
    [load],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Website inquiry keys</CardTitle>
        <p className="text-sm text-muted-foreground">
          Post your website enquiry form to{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">{FUNCTIONS_BASE}</code> with the
          key below. Keys are publishable — origin allow-lists keep them honest.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_1.4fr_auto] sm:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="key-label">Label</Label>
            <Input
              id="key-label"
              placeholder="Main website"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={80}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="key-origins">Allowed origins (comma separated)</Label>
            <Input
              id="key-origins"
              placeholder="https://example.co.za"
              value={origins}
              onChange={(e) => setOrigins(e.target.value)}
            />
          </div>
          <Button onClick={create} disabled={creating || !propertyId}>
            {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            Create key
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading keys…
          </div>
        ) : keys.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">No website keys yet.</p>
        ) : (
          <div className="space-y-2">
            {keys.map((key) => (
              <div
                key={key.id}
                className="flex flex-wrap items-center gap-3 rounded-md border border-border p-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{key.label || "Website form"}</span>
                    <Badge variant={key.is_active ? "default" : "secondary"}>
                      {key.is_active ? "Active" : "Paused"}
                    </Badge>
                  </div>
                  <code className="block truncate text-xs text-muted-foreground">{key.key_public}</code>
                  <p className="text-xs text-muted-foreground">
                    {key.request_count} submissions
                    {key.last_used_at ? ` · last ${new Date(key.last_used_at).toLocaleDateString()}` : ""}
                    {key.allowed_origins?.length ? ` · ${key.allowed_origins.join(", ")}` : " · any origin"}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    void navigator.clipboard.writeText(key.key_public);
                    toast.success("Key copied");
                  }}
                >
                  <Copy className="h-4 w-4" />
                </Button>
                <Switch checked={key.is_active} onCheckedChange={() => toggle(key)} />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
