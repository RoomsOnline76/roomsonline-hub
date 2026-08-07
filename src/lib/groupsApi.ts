import { supabase } from "@/integrations/supabase/client";

export type GroupActionName =
  | "group_create_block"
  | "group_release_block"
  | "group_pickup_room"
  | "group_import_rooming_list"
  | "group_ensure_master_folio"
  | "group_cancel"
  | "group_release_due_blocks"
  | "group_bulk_check_in"
  | "group_bulk_check_out"
  | "group_portal_token";

/**
 * Single entry point for every group side-effect (inventory, folios, pickups).
 * The edge function is the only writer of blocked/booked inventory.
 */
export async function callGroupsApi<T = Record<string, unknown>>(
  action: GroupActionName,
  payload: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await supabase.functions.invoke("pms-groups", {
    body: { action, ...payload },
  });
  if (error) {
    const detail = (data as { error?: unknown } | null)?.error;
    throw new Error(typeof detail === "string" ? detail : error.message);
  }
  if (data && (data as { error?: unknown }).error) {
    const detail = (data as { error?: unknown }).error;
    throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
  }
  return data as T;
}
