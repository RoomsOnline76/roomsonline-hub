import { supabase } from "@/integrations/supabase/client";

interface PmsApiResponse<T = unknown> {
  success: boolean;
  data: T | null;
  error: { code: string; message: string; details?: unknown } | null;
  source: string;
  fetched_at: string;
  action: string;
}

export async function callPmsApi<T = unknown>(
  action: string,
  payload: Record<string, unknown> = {}
): Promise<PmsApiResponse<T>> {
  const { data, error } = await supabase.functions.invoke("roomsonline-pms-api", {
    body: { action, ...payload },
  });

  if (error) {
    throw new Error(error.message || "PMS API call failed");
  }

  return data as PmsApiResponse<T>;
}
