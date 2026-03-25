import { useState, useEffect, useCallback } from "react";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { PageHeader } from "@/components/layout/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Save, RotateCcw, Blocks, LayoutDashboard, Globe, MousePointerClick, Shield, Gauge } from "lucide-react";

import { GutenbergConfigTab, type GutenbergConfig, GUTENBERG_DEFAULTS } from "@/components/api-configurator/GutenbergConfigTab";
import { WpAdminConfigTab, type WpAdminConfig, WP_ADMIN_DEFAULTS } from "@/components/api-configurator/WpAdminConfigTab";
import { EmbedConfigTab, type EmbedConfig, EMBED_DEFAULTS } from "@/components/api-configurator/EmbedConfigTab";
import { SmartButtonConfigTab, type SmartButtonConfig, SMART_BUTTON_DEFAULTS } from "@/components/api-configurator/SmartButtonConfigTab";
import { ApiGatesTab, type ApiGatesConfig, API_GATES_DEFAULTS } from "@/components/api-configurator/ApiGatesTab";
import { RateLimitsTab, type RateLimitsConfig, RATE_LIMITS_DEFAULTS } from "@/components/api-configurator/RateLimitsTab";

type ComponentType = "gutenberg_blocks" | "wp_admin" | "embed_widgets" | "smart_button" | "api_gates" | "rate_limits";

interface ConfigRow {
  id?: string;
  component_type: ComponentType;
  config: Record<string, unknown>;
  is_active: boolean;
}

const COMPONENT_TYPES: ComponentType[] = ["gutenberg_blocks", "wp_admin", "embed_widgets", "smart_button", "api_gates", "rate_limits"];

export default function AdminApiConfigurator() {
  const { user } = useAuth();
  const [properties, setProperties] = useState<{ id: string; name: string }[]>([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>("global");
  const [configs, setConfigs] = useState<Record<ComponentType, ConfigRow>>({} as Record<ComponentType, ConfigRow>);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from("properties").select("id, name").eq("is_active", true).order("name").then(({ data }) => {
      setProperties(data || []);
    });
  }, []);

  const loadConfigs = useCallback(async () => {
    setLoading(true);
    const propertyId = selectedPropertyId === "global" ? null : selectedPropertyId;

    const query = supabase.from("rolos_ui_configs").select("*");
    if (propertyId) {
      query.eq("property_id", propertyId);
    } else {
      query.is("property_id", null);
    }

    const { data } = await query;
    const map: Record<string, ConfigRow> = {};
    for (const type of COMPONENT_TYPES) {
      const existing = (data || []).find((r: Record<string, unknown>) => r.component_type === type);
      map[type] = existing
        ? { id: existing.id as string, component_type: type, config: existing.config as Record<string, unknown>, is_active: existing.is_active as boolean }
        : { component_type: type, config: {}, is_active: true };
    }
    setConfigs(map as Record<ComponentType, ConfigRow>);
    setLoading(false);
  }, [selectedPropertyId]);

  useEffect(() => { loadConfigs(); }, [loadConfigs]);

  const updateConfig = (type: ComponentType, config: Record<string, unknown>) => {
    setConfigs((prev) => ({ ...prev, [type]: { ...prev[type], config } }));
  };

  const saveAll = async () => {
    setSaving(true);
    const propertyId = selectedPropertyId === "global" ? null : selectedPropertyId;

    for (const type of COMPONENT_TYPES) {
      const row = configs[type];
      const payload: Record<string, unknown> = {
        property_id: propertyId,
        component_type: type,
        config: row.config,
        is_active: row.is_active,
        updated_by: user?.id,
      };

      if (row.id) {
        await (supabase.from("rolos_ui_configs") as any).update(payload).eq("id", row.id);
      } else {
        await (supabase.from("rolos_ui_configs") as any).insert([payload]);
      }
    }

    toast.success("Configuration saved");
    setSaving(false);
    loadConfigs();
  };

  const resetToDefaults = (type: ComponentType) => {
    const defaults: Record<ComponentType, Record<string, unknown>> = {
      gutenberg_blocks: GUTENBERG_DEFAULTS as unknown as Record<string, unknown>,
      wp_admin: WP_ADMIN_DEFAULTS as unknown as Record<string, unknown>,
      embed_widgets: EMBED_DEFAULTS as unknown as Record<string, unknown>,
      smart_button: SMART_BUTTON_DEFAULTS as unknown as Record<string, unknown>,
      api_gates: API_GATES_DEFAULTS as unknown as Record<string, unknown>,
      rate_limits: RATE_LIMITS_DEFAULTS as unknown as Record<string, unknown>,
    };
    updateConfig(type, defaults[type]);
    toast.info("Reset to defaults (unsaved)");
  };

  return (
    <div className="flex min-h-screen w-full bg-background">
      <AppSidebar />
      <main className="flex-1 p-6 overflow-auto">
        <PageHeader
          title="API UI Configurator"
          subtitle="Schema-driven config for WP plugin, embeds & API gates"
          actions={
            <Button onClick={saveAll} disabled={saving}>
              <Save className="h-4 w-4 mr-1" />
              {saving ? "Saving…" : "Save All"}
            </Button>
          }
        />

        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Scope</CardTitle>
          </CardHeader>
          <CardContent>
            <select
              className="flex h-10 w-full max-w-xs rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={selectedPropertyId}
              onChange={(e) => setSelectedPropertyId(e.target.value)}
            >
              <option value="global">Global Defaults</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground mt-1">
              {selectedPropertyId === "global"
                ? "Changes apply to all properties without overrides."
                : "Property-specific overrides — merges with global defaults."}
            </p>
          </CardContent>
        </Card>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading configuration…</p>
        ) : (
          <Tabs defaultValue="gutenberg_blocks">
            <TabsList className="mb-4">
              <TabsTrigger value="gutenberg_blocks" className="gap-1"><Blocks className="h-3.5 w-3.5" />Gutenberg</TabsTrigger>
              <TabsTrigger value="wp_admin" className="gap-1"><LayoutDashboard className="h-3.5 w-3.5" />WP Admin</TabsTrigger>
              <TabsTrigger value="embed_widgets" className="gap-1"><Globe className="h-3.5 w-3.5" />Embeds</TabsTrigger>
              <TabsTrigger value="smart_button" className="gap-1"><MousePointerClick className="h-3.5 w-3.5" />Smart Button</TabsTrigger>
              <TabsTrigger value="api_gates" className="gap-1"><Shield className="h-3.5 w-3.5" />API Gates</TabsTrigger>
              <TabsTrigger value="rate_limits" className="gap-1"><Gauge className="h-3.5 w-3.5" />Rate Limits</TabsTrigger>
            </TabsList>

            <TabsContent value="gutenberg_blocks">
              <div className="flex justify-end mb-3"><Button variant="ghost" size="sm" onClick={() => resetToDefaults("gutenberg_blocks")}><RotateCcw className="h-3.5 w-3.5 mr-1" />Reset</Button></div>
              <GutenbergConfigTab config={configs.gutenberg_blocks?.config as unknown as GutenbergConfig} onChange={(c) => updateConfig("gutenberg_blocks", c as unknown as Record<string, unknown>)} />
            </TabsContent>

            <TabsContent value="wp_admin">
              <div className="flex justify-end mb-3"><Button variant="ghost" size="sm" onClick={() => resetToDefaults("wp_admin")}><RotateCcw className="h-3.5 w-3.5 mr-1" />Reset</Button></div>
              <WpAdminConfigTab config={configs.wp_admin?.config as unknown as WpAdminConfig} onChange={(c) => updateConfig("wp_admin", c as unknown as Record<string, unknown>)} />
            </TabsContent>

            <TabsContent value="embed_widgets">
              <div className="flex justify-end mb-3"><Button variant="ghost" size="sm" onClick={() => resetToDefaults("embed_widgets")}><RotateCcw className="h-3.5 w-3.5 mr-1" />Reset</Button></div>
              <EmbedConfigTab config={configs.embed_widgets?.config as unknown as EmbedConfig} onChange={(c) => updateConfig("embed_widgets", c as unknown as Record<string, unknown>)} />
            </TabsContent>

            <TabsContent value="smart_button">
              <div className="flex justify-end mb-3"><Button variant="ghost" size="sm" onClick={() => resetToDefaults("smart_button")}><RotateCcw className="h-3.5 w-3.5 mr-1" />Reset</Button></div>
              <SmartButtonConfigTab config={configs.smart_button?.config as unknown as SmartButtonConfig} onChange={(c) => updateConfig("smart_button", c as unknown as Record<string, unknown>)} />
            </TabsContent>

            <TabsContent value="api_gates">
              <div className="flex justify-end mb-3"><Button variant="ghost" size="sm" onClick={() => resetToDefaults("api_gates")}><RotateCcw className="h-3.5 w-3.5 mr-1" />Reset</Button></div>
              <ApiGatesTab config={configs.api_gates?.config as unknown as ApiGatesConfig} onChange={(c) => updateConfig("api_gates", c as unknown as Record<string, unknown>)} />
            </TabsContent>

            <TabsContent value="rate_limits">
              <div className="flex justify-end mb-3"><Button variant="ghost" size="sm" onClick={() => resetToDefaults("rate_limits")}><RotateCcw className="h-3.5 w-3.5 mr-1" />Reset</Button></div>
              <RateLimitsTab config={configs.rate_limits?.config as unknown as RateLimitsConfig} onChange={(c) => updateConfig("rate_limits", c as unknown as Record<string, unknown>)} />
            </TabsContent>
          </Tabs>
        )}

        {/* JSON Preview */}
        <Card className="mt-6">
          <CardHeader className="pb-3"><CardTitle className="text-sm">Config Preview (JSON)</CardTitle></CardHeader>
          <CardContent>
            <pre className="text-xs font-mono bg-muted p-4 rounded-md overflow-auto max-h-[300px]">
              {JSON.stringify(configs, null, 2)}
            </pre>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
