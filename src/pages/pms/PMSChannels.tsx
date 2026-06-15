import { useState } from "react";

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
          </TabsList>

          {/* Tab 1: Connections */}
          <TabsContent value="connections">
            {/* Channel cards hidden — each will be restored individually as it becomes connectable & configurable. */}
            <div className="flex flex-col items-center justify-center py-16 px-6 border border-dashed rounded-lg text-center">
              <Radio className="h-10 w-10 text-muted-foreground mb-3" />
              <h3 className="text-lg font-semibold text-foreground">Channel connections coming soon</h3>
              <p className="text-sm text-muted-foreground mt-2 max-w-md">
                Channel integrations are being prepared. Each OTA will appear here once it is fully connectable
                and configurable from ROL'OS.
              </p>
            </div>
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
