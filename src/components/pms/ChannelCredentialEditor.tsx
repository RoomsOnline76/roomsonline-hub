import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, CheckCircle2, AlertCircle, KeyRound } from "lucide-react";

const CHANNEL_FIELDS: Record<string, { key: string; label: string; type?: string; placeholder?: string }[]> = {
  hyperguest: [
    { key: "api_key", label: "API Key", type: "password", placeholder: "HyperGuest API key" },
    { key: "api_secret", label: "API Secret", type: "password", placeholder: "HyperGuest API secret" },
    { key: "endpoint_url", label: "Endpoint URL", placeholder: "https://api.hyperguest.com" },
    { key: "environment", label: "Environment", placeholder: "sandbox or production" },
  ],
  hotelbeds: [
    { key: "api_key", label: "API Key", type: "password", placeholder: "HotelBeds API key" },
    { key: "api_secret", label: "API Secret", type: "password", placeholder: "HotelBeds API secret" },
    { key: "endpoint_url", label: "Endpoint URL", placeholder: "https://api.hotelbeds.com" },
  ],
  rentalsunited: [
    { key: "api_username", label: "API Username", placeholder: "Rentals United username" },
    { key: "api_password", label: "API Password", type: "password", placeholder: "API password" },
    { key: "endpoint_url", label: "Endpoint URL", placeholder: "https://rm.rentalsunited.com/api" },
  ],
  profitroom: [
    { key: "api_key", label: "API Key", type: "password", placeholder: "Profitroom API key" },
    { key: "hotel_id", label: "Hotel ID", placeholder: "Your Profitroom hotel ID" },
    { key: "endpoint_url", label: "Endpoint URL", placeholder: "https://api.profitroom.com" },
  ],
};

interface ChannelCredentialEditorProps {
  channelName: string;
}

export function ChannelCredentialEditor({ channelName }: ChannelCredentialEditorProps) {
  const [config, setConfig] = useState<Record<string, string>>({});
  const [isActive, setIsActive] = useState(false);
  const [editing, setEditing] = useState(false);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const fields = CHANNEL_FIELDS[channelName] || [];

  useEffect(() => {
    fetchConfig();
  }, [channelName]);

  const fetchConfig = async () => {
    const { data } = await supabase
      .from("rolos_channel_api_config")
      .select("*")
      .eq("channel_name", channelName)
      .maybeSingle();

    if (data) {
      setConfig((data as any).config || {});
      setIsActive((data as any).is_active ?? false);
    }
    setLoaded(true);
  };

  const hasConfig = Object.values(config).some((v) => !!v);

  const handleEdit = () => {
    setFormValues({ ...config });
    setEditing(true);
  };

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("rolos_channel_api_config")
      .upsert(
        {
          channel_name: channelName,
          config: formValues,
          is_active: isActive,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "channel_name" }
      );

    if (error) {
      toast.error("Failed to save credentials");
    } else {
      toast.success("Credentials saved");
      setEditing(false);
      fetchConfig();
    }
    setSaving(false);
  };

  if (!loaded || fields.length === 0) return null;

  return (
    <div className="border rounded-lg p-3 space-y-3 bg-muted/20">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-medium">
          <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />
          API Credentials
        </div>
        {hasConfig ? (
          <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300 text-[10px]">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Configured
          </Badge>
        ) : (
          <Badge variant="outline" className="text-[10px]">
            <AlertCircle className="h-3 w-3 mr-1" />
            Not Set
          </Badge>
        )}
      </div>

      {editing ? (
        <div className="space-y-2">
          {fields.map((field) => (
            <div key={field.key} className="space-y-1">
              <Label htmlFor={`cred-${channelName}-${field.key}`} className="text-xs">
                {field.label}
              </Label>
              <Input
                id={`cred-${channelName}-${field.key}`}
                type={field.type ?? "text"}
                value={formValues[field.key] ?? ""}
                onChange={(e) => setFormValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
                placeholder={field.placeholder}
                className="h-8 text-xs"
              />
            </div>
          ))}
          <div className="flex gap-2 pt-1">
            <Button size="sm" onClick={handleSave} disabled={saving} className="h-7 text-xs">
              {saving && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
              Save
            </Button>
            <Button size="sm" variant="outline" onClick={() => setEditing(false)} className="h-7 text-xs">
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            {fields.map((field) => (
              <div key={field.key}>
                <span className="text-[10px] text-muted-foreground">{field.label}</span>
                <p className="text-xs font-medium">
                  {config[field.key]
                    ? field.type === "password" ? "••••••••" : config[field.key]
                    : "Not set"}
                </p>
              </div>
            ))}
          </div>
          <Button size="sm" variant="outline" onClick={handleEdit} className="h-7 text-xs">
            {hasConfig ? "Update Credentials" : "Configure"}
          </Button>
        </div>
      )}
    </div>
  );
}
