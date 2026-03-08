import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// These tables are ROL'OS-specific and not in the auto-generated types.
// We use typed interfaces + explicit casts at the boundary.

interface ChannelConnection {
  id: string;
  property_id: string;
  channel_name: string;
  status: string;
  credentials: Record<string, string>;
  settings: Record<string, unknown>;
  is_active: boolean;
  last_sync_at: string | null;
  created_at: string;
}

interface ChannelRoomMapping {
  id: string;
  connection_id: string;
  room_type_id: string;
  external_room_id: string | null;
  external_room_name: string | null;
  created_at: string;
  connection?: { channel_name: string; property_id: string } | null;
  room_type?: { name: string } | null;
}

interface ChannelRateMapping {
  id: string;
  connection_id: string;
  rate_plan_id: string;
  external_rate_id: string | null;
  external_rate_name: string | null;
  created_at: string;
  connection?: { channel_name: string; property_id: string } | null;
  rate_plan?: { name: string } | null;
}

interface ChannelSyncLog {
  id: string;
  connection_id: string;
  sync_type: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  records_processed: number | null;
  error_message: string | null;
  connection?: { channel_name: string; property_id: string } | null;
  channel_name?: string;
}

const fromTable = (table: string) => supabase.from(table as never);

export function useChannelConnections(propertyId: string | null) {
  return useQuery({
    queryKey: ["channel-connections", propertyId],
    enabled: !!propertyId,
    queryFn: async () => {
      const { data, error } = await fromTable("rolos_channel_connections")
        .select("*")
        .eq("property_id", propertyId!);
      if (error) throw error;
      return (data || []) as unknown as ChannelConnection[];
    },
  });
}

export function useChannelRoomMappings(propertyId: string | null) {
  return useQuery({
    queryKey: ["channel-room-mappings", propertyId],
    enabled: !!propertyId,
    queryFn: async () => {
      const { data, error } = await fromTable("rolos_channel_room_mapping")
        .select(`
          *,
          connection:rolos_channel_connections!connection_id(channel_name, property_id),
          room_type:rolos_room_types!room_type_id(name)
        `)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return ((data || []) as unknown as ChannelRoomMapping[]).filter(
        (m) => m.connection?.property_id === propertyId
      );
    },
  });
}

export function useChannelRateMappings(propertyId: string | null) {
  return useQuery({
    queryKey: ["channel-rate-mappings", propertyId],
    enabled: !!propertyId,
    queryFn: async () => {
      const { data, error } = await fromTable("rolos_channel_rate_mapping")
        .select(`
          *,
          connection:rolos_channel_connections!connection_id(channel_name, property_id),
          rate_plan:rolos_rate_plans!rate_plan_id(name)
        `)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return ((data || []) as unknown as ChannelRateMapping[]).filter(
        (m) => m.connection?.property_id === propertyId
      );
    },
  });
}

export function useChannelSyncLogs(propertyId: string | null) {
  return useQuery({
    queryKey: ["channel-sync-logs", propertyId],
    enabled: !!propertyId,
    refetchInterval: 30000,
    queryFn: async () => {
      const { data, error } = await fromTable("rolos_channel_sync_log")
        .select(`
          *,
          connection:rolos_channel_connections!connection_id(channel_name, property_id)
        `)
        .order("started_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return ((data || []) as unknown as ChannelSyncLog[])
        .filter((l) => l.connection?.property_id === propertyId)
        .map((l) => ({ ...l, channel_name: l.connection?.channel_name }));
    },
  });
}

export function useConnectChannel(propertyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      channelName,
      credentials,
      settings,
    }: {
      channelName: string;
      credentials: Record<string, string>;
      settings: Record<string, unknown>;
    }) => {
      const { data, error } = await fromTable("rolos_channel_connections")
        .insert({
          property_id: propertyId,
          channel_name: channelName,
          status: "active",
          credentials,
          settings,
        } as never)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as ChannelConnection;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["channel-connections", propertyId] });
      toast.success("Channel connected successfully");
    },
    onError: (err: Error) => {
      toast.error("Failed to connect channel", { description: err.message });
    },
  });
}

export function useUpdateConnectionStatus(propertyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ connectionId, status }: { connectionId: string; status: string }) => {
      const { error } = await fromTable("rolos_channel_connections")
        .update({ status } as never)
        .eq("id", connectionId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["channel-connections", propertyId] });
      toast.success("Connection status updated");
    },
    onError: (err: Error) => {
      toast.error("Failed to update status", { description: err.message });
    },
  });
}

export function useUpdateMapping(propertyId: string | null, type: "room" | "rate") {
  const qc = useQueryClient();
  const table = type === "room" ? "rolos_channel_room_mapping" : "rolos_channel_rate_mapping";
  const idField = type === "room" ? "external_room_id" : "external_rate_id";
  const nameField = type === "room" ? "external_room_name" : "external_rate_name";

  return useMutation({
    mutationFn: async ({ id, externalId, externalName }: { id: string; externalId: string; externalName: string }) => {
      const { error } = await fromTable(table)
        .update({ [idField]: externalId, [nameField]: externalName } as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`channel-${type}-mappings`, propertyId] });
      toast.success("Mapping updated");
    },
    onError: (err: Error) => {
      toast.error("Failed to update mapping", { description: err.message });
    },
  });
}

export function useTriggerSync(propertyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ connectionId }: { connectionId: string }) => {
      const { data, error } = await supabase.functions.invoke("pms-channel-sync", {
        body: { action: "manual_sync", connection_id: connectionId },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["channel-sync-logs", propertyId] });
      qc.invalidateQueries({ queryKey: ["channel-connections", propertyId] });
      toast.success("Sync triggered");
    },
    onError: (err: Error) => {
      toast.error("Sync failed", { description: err.message });
    },
  });
}
