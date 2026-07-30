import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Lock } from "lucide-react";
import { useBillingConfig } from "@/hooks/useBillingConfig";


import { usePmsPropertyId } from "@/hooks/usePmsPropertyId";
import { usePmsStaffRole } from "@/hooks/usePmsStaffRole";
import { getModuleAccess } from "@/lib/pmsPermissions";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { RefreshCw, Radio } from "lucide-react";
import { ChannelCard } from "@/components/pms/channels/ChannelCard";
import { ConnectChannelDialog } from "@/components/pms/channels/ConnectChannelDialog";
import { MappingTable } from "@/components/pms/channels/MappingTable";
import { SyncLogTable } from "@/components/pms/channels/SyncLogTable";
import { ALL_CHANNELS } from "@/components/pms/channels/ChannelLogo";
import { RuReadinessScorecard } from "@/components/pms/channels/RuReadinessScorecard";
import { RuOnboardingPipeline } from "@/components/integrations/RuOnboardingPipeline";

import {
  useChannelConnections,
  useChannelRoomMappings,
  useChannelRateMappings,
  useChannelSyncLogs,
  useConnectChannel,
  useUpdateConnectionStatus,
  useUpdateMapping,
  useTriggerSync,
} from "@/hooks/useChannelManager";

export default function PMSChannels() {
  const { propertyId } = usePmsPropertyId();
  const { staffRole } = usePmsStaffRole(propertyId);
  const access = getModuleAccess(staffRole, "channels");
  const readOnly = access.readOnly;

  const { data: connections = [], isLoading } = useChannelConnections(propertyId);
  const { data: roomMappings = [] } = useChannelRoomMappings(propertyId);
  const { data: rateMappings = [] } = useChannelRateMappings(propertyId);
  const { data: syncLogs = [] } = useChannelSyncLogs(propertyId);

  const connectChannel = useConnectChannel(propertyId);
  const updateStatus = useUpdateConnectionStatus(propertyId);
  const updateRoomMapping = useUpdateMapping(propertyId, "room");
  const updateRateMapping = useUpdateMapping(propertyId, "rate");
  const triggerSync = useTriggerSync(propertyId);

  const [connectDialog, setConnectDialog] = useState<string | null>(null);

  // Billing entitlement — when admin switches Channel Manager billing off, the
  // module is locked and every listing is archived at Rentals United.
  const { config: billingConfig, isLoading: billingLoading } = useBillingConfig(propertyId ?? undefined);
  const channelManagerLocked =
    !billingLoading && billingConfig != null && billingConfig.channel_manager_enabled === false;


  const connectionMap = new Map(connections.map((c: any) => [c.channel_name, c]));

  // Count mappings per connection for display on cards
  const roomCountByConn = new Map<string, number>();
  roomMappings.forEach((m: any) => {
    roomCountByConn.set(m.connection_id, (roomCountByConn.get(m.connection_id) ?? 0) + 1);
  });
  const rateCountByConn = new Map<string, number>();
  rateMappings.forEach((m: any) => {
    rateCountByConn.set(m.connection_id, (rateCountByConn.get(m.connection_id) ?? 0) + 1);
  });

  const formattedRoomMappings = roomMappings.map((m: any) => ({
    id: m.id,
    connection_id: m.connection_id,
    channel_name: m.connection?.channel_name ?? "",
    internal_name: m.room_type?.name ?? "Unknown",
    external_id: m.external_room_id,
    external_name: m.external_room_name,
    is_active: m.is_active,
  }));

  const formattedRateMappings = rateMappings.map((m: any) => ({
    id: m.id,
    connection_id: m.connection_id,
    channel_name: m.connection?.channel_name ?? "",
    internal_name: m.rate_plan?.name ?? "Unknown",
    external_id: m.external_rate_id,
    external_name: m.external_rate_name,
    is_active: m.is_active,
  }));

  if (channelManagerLocked) {
    return (
      <div className="max-w-2xl mx-auto py-10">
        <Card className="border-dashed">
          <CardContent className="p-8 text-center space-y-3">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Lock className="h-6 w-6 text-muted-foreground" />
            </div>
            <h1 className="text-lg font-semibold text-foreground">Channel Manager unavailable</h1>
            <p className="text-sm text-muted-foreground">
              The Channel Manager module is not part of your current subscription, so your listings are
              archived with our distribution partners and no rates or availability are being sent out.
            </p>
            <p className="text-sm text-muted-foreground">
              Please speak to your account manager to activate Channel Manager distribution — listings are
              re-activated automatically once it is enabled.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (

    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Radio className="h-6 w-6" />
              Channel Manager
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Connect OTAs, manage room & rate mappings, and monitor synchronisation.
            </p>
          </div>
        </div>

        <Tabs defaultValue="connections" className="space-y-4">
          <TabsList>
            <TabsTrigger value="connections">Connections</TabsTrigger>
            <TabsTrigger value="mappings">Mappings</TabsTrigger>
            <TabsTrigger value="sync-log">Sync Log</TabsTrigger>
            <TabsTrigger value="ru-readiness">RU Readiness</TabsTrigger>
          </TabsList>


          {/* Tab 1: Connections */}
          <TabsContent value="connections">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {["booking_com", "expedia", "lekkeslaap", "airbnb", "vrbo", "google_hotels"].map((ch) => {
                const conn = connectionMap.get(ch) as any;
                const isConnected = !!conn && conn.status !== "disconnected";
                const enriched = conn
                  ? {
                      ...conn,
                      room_mapping_count: roomCountByConn.get(conn.id) ?? 0,
                      rate_mapping_count: rateCountByConn.get(conn.id) ?? 0,
                    }
                  : undefined;
                return (
                  <ChannelCard
                    key={ch}
                    channelName={ch}
                    connection={enriched}
                    isConnected={isConnected}
                    readOnly={readOnly}
                    onConnect={() => setConnectDialog(ch)}
                    onPause={conn ? () => updateStatus.mutate({ connectionId: conn.id, status: "paused" }) : undefined}
                    onResume={conn ? () => updateStatus.mutate({ connectionId: conn.id, status: "active" }) : undefined}
                    onDisconnect={conn ? () => updateStatus.mutate({ connectionId: conn.id, status: "disconnected" }) : undefined}
                    onSync={conn ? () => triggerSync.mutate({ connectionId: conn.id }) : undefined}
                  />
                );
              })}
            </div>
            <p className="text-sm text-muted-foreground mt-4">
              Don't see your channel manager? Let's talk — we'll bring it on board.
            </p>
            {isLoading && (
              <p className="text-sm text-muted-foreground mt-2">Loading channel connections…</p>
            )}
          </TabsContent>

          {/* Tab 2: Mappings */}
          <TabsContent value="mappings" className="space-y-6">
            <MappingTable
              title="Room Mappings"
              mappings={formattedRoomMappings}
              readOnly={readOnly}
              onUpdate={(id, externalId, externalName) =>
                updateRoomMapping.mutate({ id, externalId, externalName })
              }
            />
            <MappingTable
              title="Rate Mappings"
              mappings={formattedRateMappings}
              readOnly={readOnly}
              onUpdate={(id, externalId, externalName) =>
                updateRateMapping.mutate({ id, externalId, externalName })
              }
            />
          </TabsContent>

          {/* Tab 3: Sync Log */}
          <TabsContent value="sync-log">
            <SyncLogTable logs={syncLogs} />
          </TabsContent>

          {/* Tab 4: Rentals United readiness */}
          <TabsContent value="ru-readiness" className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Rentals United white-label distribution requires a complete listing. This scorecard checks
              every mandatory requirement — content, rooms &amp; beds, photos, address &amp; geo, policies and
              365-day availability &amp; pricing. Syncing stays blocked until all mandatory items pass.
            </p>
            {propertyId ? (
              <>
                <RuOnboardingPipeline propertyId={propertyId} readOnly />
                <RuReadinessScorecard propertyId={propertyId} />
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Select a property to score its readiness.</p>
            )}
          </TabsContent>
        </Tabs>
      </div>


      {/* Connect dialog */}
      {connectDialog && (
        <ConnectChannelDialog
          open={!!connectDialog}
          onOpenChange={(open) => !open && setConnectDialog(null)}
          channelName={connectDialog}
          loading={connectChannel.isPending}
          onSubmit={(credentials, settings) => {
            connectChannel.mutate(
              { channelName: connectDialog, credentials, settings },
              { onSuccess: () => setConnectDialog(null) }
            );
          }}
        />
      )}
    </>
  );
}
