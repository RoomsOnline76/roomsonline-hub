import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Loader2, CheckCircle2, AlertCircle, ExternalLink } from "lucide-react";
import { ChannelLogo, getChannelLabel } from "@/components/pms/channels/ChannelLogo";

interface ChannelApiConfig {
  id?: string;
  channel_name: string;
  config: Record<string, string>;
  is_active: boolean;
}

const CHANNEL_API_FIELDS: Record<string, { key: string; label: string; type?: string; placeholder?: string }[]> = {
  booking_com: [
    { key: "api_username", label: "API Username", placeholder: "Your Booking.com API username" },
    { key: "api_password", label: "API Password", type: "password", placeholder: "API password" },
    { key: "endpoint_url", label: "Endpoint URL", placeholder: "https://supply-xml.booking.com" },
  ],
  airbnb: [
    { key: "client_id", label: "Client ID", placeholder: "Airbnb API client ID" },
    { key: "client_secret", label: "Client Secret", type: "password", placeholder: "Client secret" },
  ],
  expedia: [
    { key: "api_key", label: "API Key", type: "password", placeholder: "EQC API key" },
    { key: "api_secret", label: "API Secret", type: "password", placeholder: "EQC API secret" },
    { key: "endpoint_url", label: "Endpoint URL", placeholder: "https://services.expediapartnercentral.com" },
  ],
  agoda: [
    { key: "api_key", label: "API Key", type: "password", placeholder: "Agoda YCS API key" },
    { key: "site_id", label: "Site ID", placeholder: "Your site ID" },
  ],
  google_hotels: [
    { key: "partner_account_id", label: "Partner Account ID", placeholder: "Google partner account" },
    { key: "api_key", label: "API Key", type: "password", placeholder: "Hotel Ads API key" },
  ],
  lekkeslaap: [
    { key: "api_key", label: "API Key", type: "password", placeholder: "Lekkeslaap API key" },
    { key: "endpoint_url", label: "Endpoint URL", placeholder: "https://api.lekkeslaap.co.za" },
  ],
  nightsbridge: [
    { key: "api_key", label: "API Key", type: "password", placeholder: "NightsBridge API key" },
    { key: "agent_code", label: "Agent Code", placeholder: "Your agent code" },
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
};

const ALL_CHANNELS = Object.keys(CHANNEL_API_FIELDS);
const DISTRIBUTION_CHANNELS = ["hyperguest", "hotelbeds", "rentalsunited", "profitroom"];

export function RolosChannelApiCards() {
  const [configs, setConfigs] = useState<Record<string, ChannelApiConfig>>({});
  const [editingChannel, setEditingChannel] = useState<string | null>(null);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchConfigs();
  }, []);

  const fetchConfigs = async () => {
    const { data, error } = await supabase
      .from("rolos_channel_api_config")
      .select("*");

    if (data && !error) {
      const mapped: Record<string, ChannelApiConfig> = {};
      data.forEach((row: any) => {
        mapped[row.channel_name] = {
          id: row.id,
          channel_name: row.channel_name,
          config: (row.config as Record<string, string>) || {},
          is_active: row.is_active,
        };
      });
      setConfigs(mapped);
    }
    setLoading(false);
  };

  const handleEdit = (channelName: string) => {
    const existing = configs[channelName]?.config || {};
    setFormValues({ ...existing });
    setEditingChannel(channelName);
  };

  const handleSave = async (channelName: string) => {
    setSaving(true);
    const existing = configs[channelName];

    const payload = {
      channel_name: channelName,
      config: formValues,
      is_active: existing?.is_active ?? false,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("rolos_channel_api_config")
      .upsert(payload, { onConflict: "channel_name" });

    if (error) {
      toast.error(`Failed to save ${getChannelLabel(channelName)} config`);
    } else {
      toast.success(`${getChannelLabel(channelName)} API config saved`);
      setEditingChannel(null);
      fetchConfigs();
    }
    setSaving(false);
  };

  const handleToggleActive = async (channelName: string, active: boolean) => {
    const existing = configs[channelName];
    const payload = {
      channel_name: channelName,
      config: existing?.config || {},
      is_active: active,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("rolos_channel_api_config")
      .upsert(payload, { onConflict: "channel_name" });

    if (error) {
      toast.error(`Failed to toggle ${getChannelLabel(channelName)}`);
    } else {
      fetchConfigs();
    }
  };

  if (loading) {
    return <div className="text-sm text-muted-foreground py-4">Loading channel configs…</div>;
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Channel API Credentials</h3>
      <p className="text-xs text-muted-foreground mb-2">
        Platform-level API credentials used by ROL'OS to connect to OTA channels on behalf of properties.
      </p>
      <Accordion type="multiple" className="space-y-2">
        {ALL_CHANNELS.map((channelName) => {
          const config = configs[channelName];
          const fields = CHANNEL_API_FIELDS[channelName] || [];
          const hasConfig = config && Object.keys(config.config).some((k) => config.config[k]);
          const isEditing = editingChannel === channelName;

          return (
            <AccordionItem key={channelName} value={channelName} className="border rounded-lg">
              <AccordionTrigger className="hover:no-underline px-4 py-2">
                <div className="flex items-center justify-between w-full pr-4">
                  <div className="flex items-center gap-3">
                    <ChannelLogo channelName={channelName} size="sm" />
                    <span className="font-medium text-sm">{getChannelLabel(channelName)}</span>
                    {DISTRIBUTION_CHANNELS.includes(channelName) && (
                      <Link
                        to="/dev/pms-control"
                        className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5 ml-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Tracker <ExternalLink className="h-2.5 w-2.5" />
                      </Link>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <div onClick={(e) => e.stopPropagation()}>
                      <Switch
                        checked={config?.is_active ?? false}
                        onCheckedChange={(v) => handleToggleActive(channelName, v)}
                      />
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
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4">
                {isEditing ? (
                  <div className="space-y-3 pt-2">
                    {fields.map((field) => (
                      <div key={field.key} className="space-y-1">
                        <Label htmlFor={`${channelName}-${field.key}`} className="text-xs">
                          {field.label}
                        </Label>
                        <Input
                          id={`${channelName}-${field.key}`}
                          type={field.type ?? "text"}
                          value={formValues[field.key] ?? ""}
                          onChange={(e) =>
                            setFormValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                          }
                          placeholder={field.placeholder}
                          className="h-9"
                        />
                      </div>
                    ))}
                    <div className="flex gap-2 pt-2">
                      <Button size="sm" onClick={() => handleSave(channelName)} disabled={saving}>
                        {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                        Save
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setEditingChannel(null)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3 pt-2">
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      {fields.map((field) => (
                        <div key={field.key}>
                          <Label className="text-xs text-muted-foreground">{field.label}</Label>
                          <p className="font-medium text-xs">
                            {config?.config[field.key]
                              ? field.type === "password"
                                ? "••••••••"
                                : config.config[field.key]
                              : "Not set"}
                          </p>
                        </div>
                      ))}
                    </div>
                    <Button size="sm" variant="outline" onClick={() => handleEdit(channelName)}>
                      {hasConfig ? "Update" : "Configure"}
                    </Button>
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}
