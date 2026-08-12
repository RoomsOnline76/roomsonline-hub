import { useCallback, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  CHANNEL_PROPERTY_TYPES,
  channelPropertyTypeLabel,
  isMappedChannelPropertyType,
  normalizeChannelPropertyType,
  type ChannelPropertyTypeOption,
} from "@/config/channelPropertyTypes";

export interface ChannelPropertyTypeRow extends ChannelPropertyTypeOption {
  /** Channel type id (ObjectTypeID). Undefined for fallback entries. */
  ruTypeId?: number;
}

/**
 * The list of property/unit types the Channel Manager accepts.
 *
 * Read from the cached channel dictionary (`ru_property_types`, refreshed from the
 * channel on demand). Until that cache has been filled the built-in list is used so
 * the editor never renders an empty dropdown.
 */
export function useChannelPropertyTypes() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["channel-property-types"],
    staleTime: 1000 * 60 * 60,
    queryFn: async (): Promise<ChannelPropertyTypeRow[]> => {
      const { data, error } = await supabase
        .from("ru_property_types")
        .select("ru_type_id, name, slug, is_active")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return (data ?? []).map((row) => ({
        value: normalizeChannelPropertyType(row.slug),
        label: row.name,
        ruTypeId: row.ru_type_id,
      }));
    },
  });

  const isLive = (query.data?.length ?? 0) > 0;
  const options = useMemo<ChannelPropertyTypeRow[]>(
    () => (isLive ? query.data! : CHANNEL_PROPERTY_TYPES),
    [isLive, query.data],
  );

  const isMapped = useCallback(
    (value: unknown) => {
      const key = normalizeChannelPropertyType(value);
      if (!key) return false;
      if (options.some((o) => o.value === key)) return true;
      // Legacy slugs and aliases still map through the static list.
      return isMappedChannelPropertyType(key);
    },
    [options],
  );

  const label = useCallback(
    (value: unknown) => {
      const key = normalizeChannelPropertyType(value);
      return options.find((o) => o.value === key)?.label ?? channelPropertyTypeLabel(key);
    },
    [options],
  );

  const refresh = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("rentalsunited-api", {
        body: { action: "list_property_types" },
      });
      if (error) throw error;
      if (data && data.success === false) {
        throw new Error(data.error?.message ?? data.message ?? "Channel type list could not be pulled");
      }
      return data as { type_count?: number; synced?: number };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["channel-property-types"] });
    },
  });

  return {
    options,
    isLive,
    isLoading: query.isLoading,
    isMapped,
    label,
    refresh,
  };
}
