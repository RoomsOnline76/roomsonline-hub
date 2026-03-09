import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Activity, HeartPulse, AlertTriangle } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { SystemOverviewTab } from "@/components/system/SystemOverviewTab";
import { ComponentHealthTab } from "@/components/system/ComponentHealthTab";
import { SystemActionsTab } from "@/components/system/SystemActionsTab";

export default function DevSystemHealth() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") || "overview";

  const handleTabChange = (value: string) => {
    setSearchParams({ tab: value }, { replace: true });
  };

  return (
    <AppLayout>
      <PageHeader
        title="System Health"
        subtitle="Monitor, diagnose, and maintain system components"
      />

      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview" className="gap-2">
            <Activity className="h-4 w-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="components" className="gap-2">
            <HeartPulse className="h-4 w-4" />
            Components
          </TabsTrigger>
          <TabsTrigger value="actions" className="gap-2">
            <AlertTriangle className="h-4 w-4" />
            Actions
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <SystemOverviewTab />
        </TabsContent>

        <TabsContent value="components">
          <ComponentHealthTab />
        </TabsContent>

        <TabsContent value="actions">
          <SystemActionsTab />
        </TabsContent>
      </Tabs>
    </AppLayout>
  );
}
