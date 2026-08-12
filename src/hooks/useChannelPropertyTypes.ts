import { useCallback, useMemo } from "react";
import {
  CHANNEL_PROPERTY_TYPES,
  channelPropertyTypeLabel,
  isMappedChannelPropertyType,
  normalizeChannelPropertyType,
  type ChannelPropertyTypeOption,
} from "@/config/channelPropertyTypes";

export interface ChannelPropertyTypeRow extends ChannelPropertyTypeOption {
  /** Channel type id (ObjectTypeID) this option publishes as. */
  ruTypeId?: number;
}

/**
 * The listing types the Channel Manager accepts for a property or unit.
 *
 * Deliberately sourced from the curated map in `channelPropertyTypes`, which mirrors the
 * channel's ObjectType ids (Apartment, Chalet, B&B room, …). The channel exposes no pull
 * endpoint for that dictionary — its property-type endpoint returns bedroom *layouts*
 * (Studio, One Bedroom, …), which are a different field and must never drive this list.
 */
export function useChannelPropertyTypes() {
  const options = useMemo<ChannelPropertyTypeRow[]>(() => CHANNEL_PROPERTY_TYPES, []);

  const isMapped = useCallback(
    (value: unknown) => isMappedChannelPropertyType(normalizeChannelPropertyType(value)),
    [],
  );

  const label = useCallback((value: unknown) => {
    const key = normalizeChannelPropertyType(value);
    return options.find((o) => o.value === key)?.label ?? channelPropertyTypeLabel(key);
  }, [options]);

  return { options, isMapped, label };
}
