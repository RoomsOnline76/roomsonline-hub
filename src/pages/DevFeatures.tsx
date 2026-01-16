import { useEffect, useState } from "react";
import { 
  Flag, 
  ToggleLeft,
  ToggleRight,
  RefreshCw,
  AlertTriangle,
  Beaker,
  Shield,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

interface FeatureFlag {
  id: string;
  key_name: string;
  name: string;
  description: string | null;
  enabled: boolean;
  category: 'production' | 'experimental' | 'deprecated';
}

export default function DevFeatures() {
  const { user, profile } = useAuth();
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  useEffect(() => {
    loadFeatureFlags();
  }, []);

  const loadFeatureFlags = async () => {
    try {
      setLoading(true);
      
      const { data, error } = await supabase
        .from('api_keys')
        .select('*')
        .or('key_name.ilike.%FEATURE_%,key_name.ilike.%FLAG_%,key_name.ilike.%ENABLE_%')
        .order('key_name');
      
      if (error) throw error;

      const formattedFlags: FeatureFlag[] = (data || []).map((item: any) => ({
        id: item.id,
        key_name: item.key_name,
        name: item.name,
        description: item.description,
        enabled: item.key_value === 'true',
        category: item.key_name.includes('EXPERIMENTAL') ? 'experimental' :
                  item.key_name.includes('DEPRECATED') ? 'deprecated' : 'production',
      }));

      setFlags(formattedFlags);
    } catch (error) {
      console.error('Error loading feature flags:', error);
      toast.error('Failed to load feature flags');
    } finally {
      setLoading(false);
    }
  };

  const toggleFlag = async (flag: FeatureFlag) => {
    setUpdating(flag.id);
    
    try {
      const newValue = !flag.enabled;
      
      const { error } = await supabase
        .from('api_keys')
        .update({ 
          key_value: newValue ? 'true' : 'false',
          updated_at: new Date().toISOString(),
        })
        .eq('id', flag.id);
      
      if (error) throw error;

      // Log the change
      await supabase.functions.invoke('log-audit-event', {
        body: {
          table_name: 'api_keys',
          record_id: flag.id,
          action_type: 'update',
          change_summary: `Feature flag "${flag.key_name}" ${newValue ? 'enabled' : 'disabled'}`,
          user_id: user?.id,
          user_email: user?.email || 'unknown',
          user_role: 'dev',
          request_origin: 'web_app',
          old_values: { enabled: flag.enabled },
          new_values: { enabled: newValue },
          changed_fields: ['key_value'],
        },
      });

      setFlags(prev => prev.map(f => 
        f.id === flag.id ? { ...f, enabled: newValue } : f
      ));
      
      toast.success(`${flag.name} ${newValue ? 'enabled' : 'disabled'}`);
    } catch (error) {
      console.error('Error toggling flag:', error);
      toast.error('Failed to update feature flag');
    } finally {
      setUpdating(null);
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'experimental':
        return <Beaker className="h-4 w-4 text-amber-500" />;
      case 'deprecated':
        return <AlertTriangle className="h-4 w-4 text-destructive" />;
      default:
        return <Shield className="h-4 w-4 text-emerald-500" />;
    }
  };

  const getCategoryBadge = (category: string) => {
    switch (category) {
      case 'experimental':
        return <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20">Experimental</Badge>;
      case 'deprecated':
        return <Badge variant="destructive">Deprecated</Badge>;
      default:
        return <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">Production</Badge>;
    }
  };

  const productionFlags = flags.filter(f => f.category === 'production');
  const experimentalFlags = flags.filter(f => f.category === 'experimental');
  const deprecatedFlags = flags.filter(f => f.category === 'deprecated');

  const FlagItem = ({ flag }: { flag: FeatureFlag }) => (
    <div className="flex items-center justify-between py-4">
      <div className="flex items-start gap-4">
        {getCategoryIcon(flag.category)}
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Label htmlFor={flag.id} className="font-medium cursor-pointer">
              {flag.name}
            </Label>
            {getCategoryBadge(flag.category)}
          </div>
          <p className="text-sm text-muted-foreground">
            {flag.description || flag.key_name}
          </p>
          <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
            {flag.key_name}
          </code>
        </div>
      </div>
      <Switch
        id={flag.id}
        checked={flag.enabled}
        onCheckedChange={() => toggleFlag(flag)}
        disabled={updating === flag.id}
      />
    </div>
  );

  return (
    <AppLayout>
      <div className="flex items-center justify-between mb-6">
        <PageHeader
          title="Feature Flags"
          subtitle="Enable/disable features across the platform"
        />
        <Button 
          variant="outline" 
          size="sm" 
          onClick={loadFeatureFlags}
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3 mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Production</CardTitle>
            <Shield className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{productionFlags.length}</div>
            <p className="text-xs text-muted-foreground">
              {productionFlags.filter(f => f.enabled).length} enabled
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Experimental</CardTitle>
            <Beaker className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{experimentalFlags.length}</div>
            <p className="text-xs text-muted-foreground">
              {experimentalFlags.filter(f => f.enabled).length} enabled
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Deprecated</CardTitle>
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{deprecatedFlags.length}</div>
            <p className="text-xs text-muted-foreground">
              {deprecatedFlags.filter(f => f.enabled).length} still enabled
            </p>
          </CardContent>
        </Card>
      </div>

      {loading ? (
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-4">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      ) : flags.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <Flag className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No feature flags configured</p>
              <p className="text-sm text-muted-foreground mt-2">
                Add keys with names containing FEATURE_, FLAG_, or ENABLE_ to create feature flags
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Production Flags */}
          {productionFlags.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5 text-emerald-500" />
                  Production Features
                </CardTitle>
                <CardDescription>Stable features for production use</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="divide-y">
                  {productionFlags.map((flag) => (
                    <FlagItem key={flag.id} flag={flag} />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Experimental Flags */}
          {experimentalFlags.length > 0 && (
            <Card className="border-amber-500/30">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Beaker className="h-5 w-5 text-amber-500" />
                  Experimental Features
                </CardTitle>
                <CardDescription>Features under development - use with caution</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="divide-y">
                  {experimentalFlags.map((flag) => (
                    <FlagItem key={flag.id} flag={flag} />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Deprecated Flags */}
          {deprecatedFlags.length > 0 && (
            <Card className="border-destructive/30">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                  Deprecated Features
                </CardTitle>
                <CardDescription>Features scheduled for removal</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="divide-y">
                  {deprecatedFlags.map((flag) => (
                    <FlagItem key={flag.id} flag={flag} />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </AppLayout>
  );
}
